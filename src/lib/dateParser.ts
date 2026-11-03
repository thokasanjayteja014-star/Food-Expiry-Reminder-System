/**
 * Expiry date extraction from OCR text.
 *
 * Pipeline:
 *   1. Normalise the OCR text (upper-case, fix common digit misreads, tidy separators).
 *   2. Find every date-like string (numeric, month-name and month/year formats).
 *   3. Give each date a role (expiry / manufacturing / unknown) from the nearest label
 *      such as "EXP", "BEST BEFORE", "USE BY", "MFG", "PKD".
 *   4. Pick the expiry date, preferring dates next to expiry labels, then
 *      "best before N months" calculated from the manufacturing date.
 *   5. Grade confidence and flag ambiguity (05/06/2026 could be 5 June or May 6).
 *
 * The result is only ever a suggestion: the user always confirms before saving.
 */
import { addDays, addMonths, daysInMonth, diffInDays, isValidYMD, toISODate, todayISO } from "./dates";

export type DatePrecision = "day" | "month";
export type DateRole = "expiry" | "manufacturing" | "unknown";
export type ParseConfidence = "high" | "medium" | "low" | "none";

export interface DateCandidate {
  /** Text as it appeared (after normalisation). */
  raw: string;
  /** Calendar date. Month-only expiry dates use the last day of the month; month-only MFG dates use the first. */
  date: string;
  precision: DatePrecision;
  role: DateRole;
  /** The label that gave this date its role, e.g. "EXP" or "BEST BEFORE". */
  label: string | null;
  /** True when DD/MM and MM/DD both give valid, different dates. */
  ambiguous: boolean;
  /** The other reading of an ambiguous date. */
  alternative: string | null;
  line: number;
  index: number;
  /** Internal: year and month for month-precision dates. */
  ym?: { year: number; month: number };
  /** Internal: numeric day/month order this candidate proves, if unambiguous. */
  order?: "DMY" | "MDY";
}

export interface RelativeShelfLife {
  amount: number;
  unit: "days" | "weeks" | "months" | "years";
  raw: string;
}

export interface ExpiryParseResult {
  /** Best expiry date, or null if it could not be confidently determined. */
  expiryDate: string | null;
  /** A low-confidence suggestion the user may choose to accept. */
  suggestedExpiryDate: string | null;
  /** Other possible readings (e.g. the MM/DD reading of an ambiguous date). */
  alternatives: string[];
  manufacturingDate: string | null;
  /** "printed" = read from the pack, "calculated" = derived from MFG + shelf life. */
  expirySource: "printed" | "calculated" | null;
  precision: DatePrecision | null;
  relativeShelfLife: RelativeShelfLife | null;
  confidence: ParseConfidence;
  ambiguous: boolean;
  /** Always true unless confidence is high and the date is unambiguous. */
  needsConfirmation: boolean;
  messages: string[];
  candidates: DateCandidate[];
}

export interface ParseOptions {
  /** Today's date (YYYY-MM-DD); injectable for tests. */
  today?: string;
  /** Default reading for ambiguous numeric dates. Day-first is standard in India/UK/EU. */
  preferDayFirst?: boolean;
}

export const MESSAGES = {
  notFound: "No expiry date was detected. Please enter the date manually.",
  notConfident: "Expiry date could not be confidently detected. Please enter it manually.",
  ambiguous: "Please confirm the expiry date.",
  calculated: "Calculated from manufacturing date",
  verify: "Please verify the detected expiry date.",
} as const;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const EXPIRY_LABEL =
  /(?<![A-Z])(?:EXP(?:IRY|IRES|IRATION|IRING)?\.?(?:\s*(?:DATE|DT)\.?)?|BEST\s*BEFORE(?:\s*END)?|BEST\s*IF\s*USED\s*(?:BY|BEFORE)|BEST\s*BY|BBE|BBD|BB|UBD|MHD|SELL\s*BY|E(?=\s?[:.]?\s?\d)|USE\s*BY|USE\s*BEFORE|CONSUME\s*(?:BEFORE|BY)|VALID\s*(?:TILL|UNTIL|UPTO))(?![A-Z])/g;

const MFG_LABEL =
  /(?<![A-Z])(?:MFG\.?(?:\s*(?:DATE|DT)\.?)?|MFD\.?(?:\s*ON)?|MANUFACTURED(?:\s*ON)?|MANUFACTURING\s*DATE|DATE\s*OF\s*(?:MFG|MANUFACTURE|PACKING)|DOM|PKD\.?(?:\s*ON)?|PACKED(?:\s*(?:ON|DATE))?|PKG\.?(?:\s*DATE)?|PACKAGING\s*DATE|PROD(?:UCED|UCTION\s*DATE)?|[PM](?=\s?[:.]?\s?\d))(?![A-Z])/g;

interface LabelHit {
  role: Exclude<DateRole, "unknown">;
  text: string;
  start: number;
  end: number;
}

function findLabels(line: string): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const m of line.matchAll(EXPIRY_LABEL)) {
    hits.push({ role: "expiry", text: m[0].replace(/\s+/g, " "), start: m.index, end: m.index + m[0].length });
  }
  for (const m of line.matchAll(MFG_LABEL)) {
    hits.push({ role: "manufacturing", text: m[0].replace(/\s+/g, " "), start: m.index, end: m.index + m[0].length });
  }
  return hits.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Fixes common OCR misreads inside date-like tokens only (O->0, I/l/|->1, S->5),
 * so words such as "SOUP" are left alone.
 */
function fixDigitMisreads(text: string): string {
  return text.replace(/[0-9OIlS|]{1,4}(?:[/.\-][0-9OIlS|]{1,4}){1,2}/g, (token) => {
    const digits = (token.match(/\d/g) ?? []).length;
    if (digits < 3) return token;
    return token.replace(/O/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5");
  });
}

/**
 * Fixes how OCR commonly misreads the labels themselves, especially on dot-matrix and
 * inkjet print: "WFG" or "MF6" for MFG, "0T" for DT, "E.X.P." for EXP, "EXPlRY" for EXPIRY.
 * Only short, label-shaped tokens are touched.
 */
function fixLabelMisreads(text: string): string {
  return (
    text
      // "IN-26/DEC-27": a clipped JUN before a month/year pair
      .replace(/(?<![A-Z])[IJU]?[IJU]N(?=[\-'/.]\d{2}\s?\/\s?[A-Z]{3}[\-'/.]?\d{2})/g, "JUN")
      // "JUM-26", "JUTI-26": an N misread in a month/year pair
      .replace(/(?<![A-Z])JU(?:M|TI|II|H|RI)(?=[\-'/.]\d{2}(?!\d))/g, "JUN")
      // Spaced letters embossed on bottles: "M F D", "U B D", "E X P"
      .replace(/(?<![A-Z])([MUEPB])\s([FBXK])\s([DGP])(?![A-Z])/g, "$1$2$3")
      // Dotted acronyms: M.F.G. -> MFG, E.X.P -> EXP, B.B. -> BB
      .replace(/(?<![A-Z])([A-Z])\.\s?([A-Z])\.\s?([A-Z])(?![A-Z])\.?/g, "$1$2$3")
      .replace(/(?<![A-Z])(B)\.\s?(B)(?![A-Z])\.?/g, "$1$2")
      .replace(/(?<![A-Z0-9])[MWNHVY][FPE][GC6](?![A-Z])/g, "MFG")
      .replace(/(?<![A-Z0-9])[MWNH]F[D0O](?![A-Z])/g, "MFD")
      .replace(/(?<![A-Z0-9])P[KX][D0O](?![A-Z])/g, "PKD")
      .replace(/(?<![A-Z0-9])[E3][XK]P[I1L]?R[YV](?![A-Z])/g, "EXPIRY")
      .replace(/(?<![A-Z0-9])[E3][XK][PF](?![A-Z])/g, "EXP")
      // Faint dot-matrix labels on cans: "CUP 22.12/26", "COP 2212/26" -> EXP; "AFD/MED 22-04" -> MFD
      .replace(/(?<![A-Z0-9])[CE][UOXK]?[PF](?=\s?[:.]?\s?\d)/g, "EXP")
      .replace(/(?<![A-Z0-9])[AMVWT][FE][DO0](?=\s?[:.]?\s?\d)/g, "MFD")
      .replace(/(?<![A-Z0-9])P[EKR][D0O](?=\s?[:.]?\s?\d)/g, "PKD")
      .replace(/(?<![A-Z0-9])B[E3]B(?=\s?[:.]?\s?\d)/g, "BB")
      .replace(/BEF[O0]RE/g, "BEFORE")
      .replace(/(?<![A-Z])M[O0D][NH]?[TH]{1,2}S(?![A-Z])/g, "MONTHS")
      // "TWENTY FOUR MONTHS" -> "24 MONTHS"
      .replace(/(?<![A-Z])(TWENTY|THIRTY)[\s\-]?(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)(?![A-Z])/g, (_, tens: string, unit: string) =>
        String((tens === "TWENTY" ? 20 : 30) + ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"].indexOf(unit) + 1),
      )
      // "MFG.0T" / "EXP OT" -> "MFG.DT"
      .replace(/(MFG|MFD|EXP|EXPIRY)([.\s:,]*)(?:[D0O]T|DY|OY|D7)(?![A-Z])/g, "$1$2DT")
      // "MFG 07.03/2025", "MFG 0703/2025": "07" is a misread "DT" when a month/year follows
      // with a different separator. "MFG 07.03.2025" (7 March) is left alone.
      .replace(/(MFG|MFD|EXP|EXPIRY)([.\s:,]*)[0O]7(?=(?:[.\s,:]?)\d{1,2}[/\-]\d{2,4}(?![/.\-]?\d))/g, "$1$2DT ")
  );
}

/**
 * Dot-matrix printers on cans leave thin slashes that OCR drops or reads as 7 or 1:
 * "2212/26", "22-04 726" and "22712726" are 22/12/26, 22-04-26 and 22/12/26. Only rebuilt
 * when the day, month and year are plausible, so prices and batch codes are left alone.
 */
const DOT_MATRIX_SEPARATOR =
  /(?<![\d/.\-])(\d{2})(?:(\d{2})([/.\-]|[71](?=\d{2}(?!\d)))|([/.\-])(\d{2}) ?[71]?|[71](\d{2})[71])(\d{2})(?![\d/.\-])/g;

/** "14.89.26", "MFG:93/26": a month starting with 8 or 9 is a dot-matrix 0. */
const DOT_MATRIX_MONTH = /(?<![\d/.\-])((?:\d{1,2}[/.\-])?)[89]([1-9])(?=[/.\-]\d{2}(?:\d{2})?(?![\d/.\-]))/g;

const DATE_LABEL_BEFORE = /(?:MFD|MFG|PKD|EXP|BB|USE BY|BEST BEFORE)[.:]?\s?$/;

function repairDotMatrixSeparator(
  match: string, d: string, m1: string | undefined, sep1: string | undefined, sep2: string | undefined,
  m2: string | undefined, m3: string | undefined, y: string, offset: number, text: string,
): string {
  const mm = m1 ?? m2 ?? m3!;
  const month = Number(mm);
  const day = Number(d);
  const year = Number(y);
  const labelled = DATE_LABEL_BEFORE.test(text.slice(Math.max(0, offset - 14), offset));
  // Batch codes like "LOT 22-1234" are left alone: away from a date label the year must be
  // plausible and the slash must have been misread, not just dropped.
  const dropped = sep2 !== undefined && !/[71]$/.test(match.slice(0, -2).trimEnd());
  if (day < 1 || day > 31 || month < 1 || month > 12) return match;
  if (!labelled && (year < 20 || year > 45 || dropped)) return match;
  const sep = sep1 && /[/.\-]/.test(sep1) ? sep1 : (sep2 ?? "/");
  return `${d}${sep}${mm}${sep}${y}`;
}

export function normaliseOcrText(text: string): string {
  const fixed = fixDigitMisreads(text.replace(/\r\n?/g, "\n"));
  return fixLabelMisreads(fixed.toUpperCase())
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/(\d)\s*([/.\-])\s*(?=\d)/g, "$1$2") // "20 / 10 / 2026" -> "20/10/2026"
    .replace(DOT_MATRIX_SEPARATOR, repairDotMatrixSeparator)
    .replace(DOT_MATRIX_MONTH, "$10$2")
    // "28/09/2827": a year 28xx or 23xx is 20xx with a dot-matrix 0 misread
    .replace(/(?<=\d[/.\-])2[38]([0-4]\d)(?!\d)/g, "20$1")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
}

// ---------------------------------------------------------------------------
// Date candidates
// ---------------------------------------------------------------------------

const MONTH =
  "(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?|MRZ|MAI|OKT|DEZ)";

const MONTH_INDEX: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  // German packs (MHD): März, Mai, Oktober, Dezember
  MRZ: 3, MAI: 5, OKT: 10, DEZ: 12,
};

function monthFromName(name: string): number {
  return MONTH_INDEX[name.slice(0, 3)] ?? 0;
}

function fullYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

const YEAR_MIN = 2000;
const YEAR_MAX = 2099;

/** Ordered by priority: earlier patterns claim text first so later ones cannot re-match it. */
const PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Canada bilingual BB/MA: 2027 AL 19 (year, two-letter month, day)
  { name: "bbma", re: /(?<!\d)(20\d{2})\s?(JA|FE|MR|AL|MA|JN|JL|AU|SE|OC|NO|DE)\s?(\d{1,2})(?!\d)/g },
  // 2026-10-20
  { name: "ymd", re: /(?<!\d)(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?!\d)/g },
  // 20 OCT 2026, 20-OCT-26, 20OCT2026, 20TH OCTOBER 2026
  { name: "dMonY", re: new RegExp(`(?<!\\d)(?<![A-Z]{2,4}[\\-'])(\\d{1,2})(?:ST|ND|RD|TH)?[\\s/.\\-,]*${MONTH}(?![A-Z])\\.?[\\s/.\\-,']*(\\d{4}|\\d{2})(?!\\d)`, "g") },
  // OCT 20 2026, OCT 20, 2026
  { name: "MonDY", re: new RegExp(`(?<![A-Z])${MONTH}(?![A-Z])\\.?[\\s/.\\-]*(\\d{1,2})(?:ST|ND|RD|TH)?[\\s,/.\\-]+(\\d{4})(?!\\d)`, "g") },
  // 20/10/2026, 20-10-26, 20.10.2026
  { name: "dmy", re: /(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?![\d/.\-]*\d)/g },
  // OCT 2026, OCT/26, OCT-2026
  { name: "MonY", re: new RegExp(`(?<![A-Z])${MONTH}(?![A-Z])\\.?(?:[\\s/.\\-,]*(\\d{4})|[/.\\-'](\\d{2}))(?!\\d)`, "g") },
  // 10/2026
  { name: "mY", re: /(?<![\d/\-])(?<!\d\.)(\d{1,2})[/.\-](\d{4})(?![\d/.\-])/g },
  // 20 10 2026 (spaces) - only next to a label
  { name: "dmySpace", re: /(?<![\d/.\-])(\d{1,2}) (\d{1,2}) (20\d{2})(?![\d/.\-]*\d)/g },
  // 201026, 20102026, 20261020 (no separators) - only next to a label
  { name: "packed", re: /(?<![\d/.\-:])(\d{8}|\d{6})(?![\d/.\-:])/g },
  // 10/27 (month/2-digit year) - only kept when next to a label, see below
  { name: "mYY", re: /(?<![\d/\-])(?<!\d\.)(\d{1,2})[/.\-](\d{2})(?![\d/.\-])/g },
];

interface RawCandidate {
  raw: string;
  index: number;
  end: number;
  kind: "day" | "month";
  year: number;
  month: number;
  day: number;
  ambiguous: boolean;
  alt: { year: number; month: number; day: number } | null;
  order?: "DMY" | "MDY";
  needsLabel?: boolean;
}

function extractRawCandidates(line: string, preferDayFirst: boolean, currentYear: number): RawCandidate[] {
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const out: RawCandidate[] = [];

  for (const { name, re } of PATTERNS) {
    for (const m of line.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const c = toCandidate(name, m, preferDayFirst, currentYear);
      if (!c) continue;
      taken.push([start, end]);
      out.push({ ...c, raw: m[0].trim(), index: start, end });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function toCandidate(
  name: string,
  m: RegExpMatchArray,
  preferDayFirst: boolean,
  currentYear: number,
): Omit<RawCandidate, "raw" | "index" | "end"> | null {
  const g = (i: number) => m[i] ?? "";
  const inRange = (y: number) => y >= YEAR_MIN && y <= YEAR_MAX;

  switch (name) {
    case "ymd": {
      const year = Number(g(1));
      const month = Number(g(2));
      const day = Number(g(3));
      if (!inRange(year) || !isValidYMD(year, month, day)) return null;
      return { kind: "day", year, month, day, ambiguous: false, alt: null };
    }
    case "dMonY": {
      const day = Number(g(1));
      const month = monthFromName(g(2));
      const year = fullYear(g(3));
      if (!inRange(year) || !isValidYMD(year, month, day)) return null;
      return { kind: "day", year, month, day, ambiguous: false, alt: null };
    }
    case "MonDY": {
      const month = monthFromName(g(1));
      const day = Number(g(2));
      const year = Number(g(3));
      if (!inRange(year) || !isValidYMD(year, month, day)) return null;
      return { kind: "day", year, month, day, ambiguous: false, alt: null };
    }
    case "dmy": {
      const a = Number(g(1));
      const b = Number(g(2));
      const year = fullYear(g(3));
      if (!inRange(year)) return null;
      const dmyValid = isValidYMD(year, b, a);
      const mdyValid = isValidYMD(year, a, b);
      if (dmyValid && mdyValid && a !== b) {
        // Both readings are real dates: genuinely ambiguous.
        const dmy = { year, month: b, day: a };
        const mdy = { year, month: a, day: b };
        const [primary, alt] = preferDayFirst ? [dmy, mdy] : [mdy, dmy];
        return { kind: "day", ...primary, ambiguous: true, alt };
      }
      if (dmyValid) return { kind: "day", year, month: b, day: a, ambiguous: false, alt: null, order: a > 12 ? "DMY" : undefined };
      if (mdyValid) return { kind: "day", year, month: a, day: b, ambiguous: false, alt: null, order: "MDY" };
      return null;
    }
    case "MonY": {
      const month = monthFromName(g(1));
      const year = g(2) ? Number(g(2)) : fullYear(g(3));
      if (!inRange(year) || month < 1) return null;
      return { kind: "month", year, month, day: 1, ambiguous: false, alt: null };
    }
    case "mY": {
      const month = Number(g(1));
      const year = Number(g(2));
      if (!inRange(year) || month < 1 || month > 12) return null;
      return { kind: "month", year, month, day: 1, ambiguous: false, alt: null };
    }
    case "bbma": {
      const year = Number(g(1));
      const month = ["JA", "FE", "MR", "AL", "MA", "JN", "JL", "AU", "SE", "OC", "NO", "DE"].indexOf(g(2)) + 1;
      const day = Number(g(3));
      if (!inRange(year) || !isValidYMD(year, month, day)) return null;
      return { kind: "day", year, month, day, ambiguous: false, alt: null, needsLabel: true };
    }
    case "dmySpace": {
      const day = Number(g(1));
      const month = Number(g(2));
      const year = Number(g(3));
      if (!inRange(year) || !isValidYMD(year, month, day)) return null;
      return { kind: "day", year, month, day, ambiguous: false, alt: null, needsLabel: true };
    }
    case "packed": {
      const d = g(1);
      const n = (a: number, b: number) => Number(d.slice(a, b));
      const candidates: Array<[number, number, number]> =
        d.length === 8
          ? [[n(0, 4), n(4, 6), n(6, 8)], [n(4, 8), n(2, 4), n(0, 2)]] // YYYYMMDD, DDMMYYYY
          : [[2000 + n(4, 6), n(2, 4), n(0, 2)], [2000 + n(0, 2), n(2, 4), n(4, 6)]]; // DDMMYY, YYMMDD
      const hit = candidates.find(([y, m, day]) => y >= currentYear - 5 && y <= currentYear + 10 && isValidYMD(y, m, day));
      if (!hit) return null;
      return { kind: "day", year: hit[0], month: hit[1], day: hit[2], ambiguous: false, alt: null, needsLabel: true };
    }
    case "mYY": {
      const month = Number(g(1));
      const year = fullYear(g(2));
      // "10/27" is only read as Oct 2027 when the year is plausible for a food label.
      if (month < 1 || month > 12 || year < currentYear - 3 || year > currentYear + 10) return null;
      return { kind: "month", year, month, day: 1, ambiguous: false, alt: null, needsLabel: true };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Relative shelf life: "BEST BEFORE 6 MONTHS FROM MFG"
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  ELEVEN: 11, TWELVE: 12, FIFTEEN: 15, EIGHTEEN: 18, TWENTY: 20, THIRTY: 30,
};

const RELATIVE =
  /(?:BEST\s*BEFORE|BEST\s*WITHIN|USE\s*WITHIN|USE\s*BEFORE|CONSUME\s*WITHIN|USE\s*BY|EXPIRY|EXP\.?|SHELF\s*LIFE)[^0-9\n]{0,20}?(\d{1,3}|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|FIFTEEN|EIGHTEEN|TWENTY|THIRTY)\s*(MONTHS?|MTHS?|DAYS?|WEEKS?|WKS?|YEARS?|YRS?)(?![A-Z])/;

export function findRelativeShelfLife(normalisedText: string): RelativeShelfLife | null {
  const m = RELATIVE.exec(normalisedText);
  if (!m) return null;
  const numText = m[1] ?? "";
  const amount = /^\d+$/.test(numText) ? Number(numText) : (WORD_NUMBERS[numText] ?? 0);
  if (!amount) return null;
  const u = (m[2] ?? "").slice(0, 2);
  const unit = u === "MO" || u === "MT" ? "months" : u === "DA" ? "days" : u === "WE" || u === "WK" ? "weeks" : "years";
  return { amount, unit, raw: m[0] };
}

export function applyShelfLife(fromDate: string, life: RelativeShelfLife): string {
  switch (life.unit) {
    case "days":
      return addDays(fromDate, life.amount);
    case "weeks":
      return addDays(fromDate, life.amount * 7);
    case "months":
      return addMonths(fromDate, life.amount);
    case "years":
      return addMonths(fromDate, life.amount * 12);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function extractDateCandidates(text: string, options: ParseOptions = {}): DateCandidate[] {
  const preferDayFirst = options.preferDayFirst ?? true;
  const currentYear = Number((options.today ?? todayISO()).slice(0, 4));
  const lines = normaliseOcrText(text).split("\n");
  const result: DateCandidate[] = [];

  lines.forEach((line, lineNo) => {
    const labels = findLabels(line);
    const raws = extractRawCandidates(line, preferDayFirst, currentYear);
    const prevLine = lineNo > 0 ? (lines[lineNo - 1] ?? "") : "";
    const prevLabels = findLabels(prevLine);
    // Previous line holds only labels (column layout: "MFG  EXP" over "10/26  04/27").
    const prevIsHeader = prevLabels.length > 0 && extractRawCandidates(prevLine, preferDayFirst, currentYear).length === 0;
    const unlabeled: number[] = [];

    raws.forEach((rc) => {
      // Nearest label that ends before this date on the same line, with no other date in between.
      let label: LabelHit | null = null;
      for (const l of labels) {
        if (l.end <= rc.index) {
          const between = raws.some((o) => o !== rc && o.index >= l.end && o.index < rc.index);
          if (!between) label = l;
        }
      }
      // "PKD: MAY/2026 USE BY: APRIL/2028" with the PKD label misread: a date printed
      // straight before an expiry label is the packing/manufacturing date.
      if (!label) {
        const next = labels.find((l) => l.start >= rc.end && !raws.some((o) => o !== rc && o.index >= rc.end && o.index < l.start));
        if (next?.role === "expiry" && /^[\s.,:;|/\-]*$/.test(line.slice(rc.end, next.start))) {
          label = { role: "manufacturing", text: "before " + next.text, start: rc.index, end: rc.index };
        }
      }
      if (rc.needsLabel && !label && !prevIsHeader) return; // "10/27" with no label is too risky
      if (!label) unlabeled.push(result.length);
      result.push(finaliseCandidate(rc, label?.role ?? "unknown", label?.text ?? null, lineNo));
    });

    // Column layout: map dates to labels on the previous line in order.
    if (prevIsHeader && unlabeled.length > 0) {
      unlabeled.forEach((idx, k) => {
        const l = prevLabels.length === unlabeled.length ? prevLabels[k] : prevLabels[prevLabels.length - 1];
        const c = result[idx];
        if (l && c) result[idx] = relabel(c, l.role, l.text);
      });
    }
  });

  return result;
}

/** Gives a candidate a new role; month-only dates move to the first/last day accordingly. */
function relabel(c: DateCandidate, role: DateRole, label: string | null): DateCandidate {
  const date =
    c.precision === "month" && c.ym
      ? toISODate(c.ym.year, c.ym.month, role === "manufacturing" ? 1 : daysInMonth(c.ym.year, c.ym.month))
      : c.date;
  return { ...c, role, label, date };
}

/** Converts a raw match into a candidate; month-only dates resolve by role. */
function finaliseCandidate(
  rc: RawCandidate,
  role: DateRole,
  label: string | null,
  line: number,
): DateCandidate {
  if (rc.kind === "month") {
    const day = role === "manufacturing" ? 1 : daysInMonth(rc.year, rc.month);
    return {
      raw: rc.raw,
      date: toISODate(rc.year, rc.month, day),
      precision: "month",
      role,
      label,
      ambiguous: false,
      alternative: null,
      line,
      index: rc.index,
      ym: { year: rc.year, month: rc.month },
    };
  }
  return {
    raw: rc.raw,
    date: toISODate(rc.year, rc.month, rc.day),
    precision: "day",
    role,
    label,
    ambiguous: rc.ambiguous,
    alternative: rc.alt ? toISODate(rc.alt.year, rc.alt.month, rc.alt.day) : null,
    line,
    index: rc.index,
    order: rc.order,
  };
}

/** Swaps the primary and alternative reading of an ambiguous candidate. */
function swapReading(c: DateCandidate): DateCandidate {
  return c.alternative ? { ...c, date: c.alternative, alternative: c.date } : c;
}

/**
 * Parses OCR text and returns the most likely expiry date with a confidence grade.
 * See the file header for the strategy.
 */
export function parseExpiryDate(text: string, options: ParseOptions = {}): ExpiryParseResult {
  const today = options.today ?? todayISO();
  const preferDayFirst = options.preferDayFirst ?? true;
  const messages: string[] = [];
  let candidates = extractDateCandidates(text ?? "", { ...options, today, preferDayFirst });

  // If any unambiguous numeric date on the pack reveals its day/month order,
  // apply that order to the ambiguous ones (packs use one format throughout).
  const orders = new Set(candidates.map((c) => c.order).filter(Boolean));
  if (orders.size === 1) {
    const order = [...orders][0];
    const wantDayFirst = order === "DMY";
    candidates = candidates.map((c) => {
      if (!c.ambiguous) return c;
      const resolved = wantDayFirst === preferDayFirst ? c : swapReading(c);
      return { ...resolved, ambiguous: false, alternative: null };
    });
  }

  const mfgCands = candidates.filter((c) => c.role === "manufacturing");
  let manufacturing = mfgCands[0] ?? null;
  const expiryCands = candidates.filter((c) => c.role === "expiry");
  const unknownCands = candidates.filter((c) => c.role === "unknown");
  const relative = findRelativeShelfLife(normaliseOcrText(text ?? ""));

  let chosen: DateCandidate | null = null;
  let confidence: ParseConfidence = "none";
  let expirySource: ExpiryParseResult["expirySource"] = null;
  let alternatives: string[] = [];

  if (expiryCands.length > 0) {
    // 1. A date printed next to an expiry label.
    chosen = expiryCands.find((c) => c.precision === "day") ?? expiryCands[0] ?? null;
    expirySource = "printed";
    confidence = "high";
    const distinct = [...new Set(expiryCands.map((c) => c.date))];
    if (distinct.length > 1) {
      confidence = "medium";
      alternatives = distinct.filter((d) => d !== chosen?.date);
      messages.push("More than one expiry date was found. Please check which one is correct.");
    }
  } else if (relative && (manufacturing || unknownCands.length === 1)) {
    // 2. "Best before 6 months from MFG": calculate from the manufacturing date.
    const base = manufacturing ?? unknownCands[0] ?? null;
    if (base) {
      if (!manufacturing) manufacturing = { ...base, role: "manufacturing" };
      // "PKD MAY 2026, best before 24 months": good until the end of April 2028.
      const monthOnly = manufacturing.precision === "month" && (relative.unit === "months" || relative.unit === "years");
      const date = monthOnly ? addDays(applyShelfLife(manufacturing.date, relative), -1) : applyShelfLife(manufacturing.date, relative);
      chosen = { ...manufacturing, date, role: "expiry", label: relative.raw, precision: monthOnly ? "month" : "day", ambiguous: base.ambiguous, alternative: base.alternative ? applyShelfLife(base.alternative, relative) : null };
      expirySource = "calculated";
      confidence = "medium";
      messages.push(`${MESSAGES.calculated} (${relative.amount} ${relative.unit} after ${manufacturing.raw}).`);
    }
  } else if (!manufacturing && unknownCands.length === 2 && unknownCands[0]!.date < unknownCands[1]!.date && unknownCands[1]!.line === unknownCands[0]!.line) {
    // Two unlabelled dates side by side ("JUN-26/DEC-27", "21/08/26  18/12/26"): packs print MFG then EXP.
    manufacturing = relabel(unknownCands[0]!, "manufacturing", null);
    chosen = relabel(unknownCands[1]!, "expiry", null);
    expirySource = "printed";
    confidence = "medium";
  } else if (unknownCands.length > 0) {
    // 3. Unlabelled dates: the expiry is normally the latest date on the pack.
    const afterMfg = unknownCands.filter((c) => !manufacturing || c.date > manufacturing.date);
    const pool = afterMfg.length > 0 ? afterMfg : unknownCands;
    chosen = [...pool].sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
    expirySource = "printed";
    confidence = "low";
    if (unknownCands.length > 1) messages.push("Several dates were found but none was labelled as the expiry date.");
  } else if (relative && !manufacturing) {
    messages.push("A shelf life was found but no manufacturing date to calculate from.");
  }

  // Ambiguous DD/MM vs MM/DD: use the MFG date to rule out a reading if possible.
  let ambiguous = Boolean(chosen?.ambiguous && chosen.alternative);
  if (chosen && ambiguous && chosen.alternative) {
    const mfgDate = manufacturing?.date;
    const primaryOk = !mfgDate || chosen.date > mfgDate;
    const altOk = !mfgDate || chosen.alternative > mfgDate;
    if (primaryOk && !altOk) {
      ambiguous = false;
    } else if (!primaryOk && altOk) {
      chosen = swapReading(chosen);
      ambiguous = false;
    } else {
      alternatives = [chosen.alternative, ...alternatives.filter((d) => d !== chosen?.alternative)];
      if (confidence === "high") confidence = "medium";
      messages.push(`${MESSAGES.ambiguous} "${chosen.raw}" could be read in more than one way.`);
    }
  }

  // Sanity checks.
  if (chosen) {
    if (manufacturing && chosen.date < manufacturing.date) {
      confidence = "low";
      messages.push("The detected expiry date is before the manufacturing date.");
    }
    const delta = diffInDays(today, chosen.date);
    if (delta < -730 || delta > 3650) {
      confidence = "low";
      messages.push("The detected expiry date looks unusual for food.");
    }
    if (chosen.precision === "month") {
      messages.push("Only the month and year are printed, so the last day of that month is used.");
    }
  }

  const isConfident = confidence === "high" || confidence === "medium";
  if (!chosen) {
    messages.unshift(MESSAGES.notFound);
  } else if (!isConfident) {
    messages.unshift(MESSAGES.notConfident);
  } else if (ambiguous || confidence === "medium") {
    if (!messages.some((m) => m.startsWith(MESSAGES.ambiguous))) messages.push(MESSAGES.verify);
  }

  return {
    expiryDate: chosen && isConfident ? chosen.date : null,
    suggestedExpiryDate: chosen ? chosen.date : null,
    alternatives,
    manufacturingDate: manufacturing?.date ?? null,
    expirySource: chosen ? expirySource : null,
    precision: chosen?.precision ?? null,
    relativeShelfLife: relative,
    confidence: chosen ? confidence : "none",
    ambiguous,
    needsConfirmation: !(confidence === "high" && !ambiguous),
    messages,
    candidates: candidates.map(({ ym: _ym, order: _order, ...c }) => c),
  };
}
