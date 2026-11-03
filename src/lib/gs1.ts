import { daysInMonth, isValidYMD, toISODate } from "./dates";

/**
 * Reads dates out of barcode text.
 *
 * Ordinary retail barcodes (EAN-13, EAN-8, UPC) hold only the product number, never dates.
 * Dates are only present in GS1 barcodes that carry "application identifiers": GS1 DataMatrix,
 * GS1-128, GS1 DataBar Expanded, GS1 QR codes and GS1 Digital Link URLs, for example
 * "(01)08901234567890(11)260101(17)261231(10)B123".
 */
export interface BarcodeData {
  /** The product number (GTIN / EAN / UPC), if present. */
  gtin: string | null;
  expiryDate: string | null;
  bestBeforeDate: string | null;
  sellByDate: string | null;
  productionDate: string | null;
  packagingDate: string | null;
  batch: string | null;
  /** True when the text was GS1 data with application identifiers. */
  isGs1: boolean;
}

const GS = "\u001d";

/** Data length of fixed-length application identifiers, by AI. */
const FIXED: Record<string, number> = {
  "00": 18, "01": 14, "02": 14, "03": 14,
  "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6,
  "20": 2,
};
/** Maximum data length of common variable-length application identifiers. */
const VARIABLE: Record<string, number> = {
  "10": 20, "21": 20, "22": 20, "30": 8, "37": 8,
};

const DATE_AIS = {
  "11": "productionDate",
  "13": "packagingDate",
  "15": "bestBeforeDate",
  "16": "sellByDate",
  "17": "expiryDate",
} as const;

/**
 * GS1 YYMMDD. The century is the one that puts the year closest to now (GS1 General
 * Specifications 7.12), and day "00" means the last day of the month.
 */
export function gs1Date(yymmdd: string, now: Date = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  const current = now.getFullYear();
  const diff = yy - (current % 100);
  let century = Math.floor(current / 100);
  if (diff >= 51) century -= 1;
  else if (diff <= -50) century += 1;
  const year = century * 100 + yy;
  if (month < 1 || month > 12) return null;
  if (day === 0) day = daysInMonth(year, month);
  return isValidYMD(year, month, day) ? toISODate(year, month, day) : null;
}

/** Splits GS1 element strings into AI/value pairs. Returns null if the text is not GS1. */
export function parseGs1Elements(text: string): Array<[string, string]> | null {
  let s = text.trim();

  // GS1 Digital Link: https://example.com/01/09506000134352/10/ABC?17=261231
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const parts = url.pathname.split("/").filter(Boolean);
      const out: Array<[string, string]> = [];
      const start = parts.findIndex((p) => p === "01" || p === "00");
      if (start === -1) return null;
      for (let i = start; i + 1 < parts.length; i += 2) {
        const ai = parts[i]!;
        if (/^\d{2,4}$/.test(ai)) out.push([ai, decodeURIComponent(parts[i + 1]!)]);
      }
      url.searchParams.forEach((v, k) => {
        if (/^\d{2,4}$/.test(k)) out.push([k, v]);
      });
      return out.length ? out : null;
    } catch {
      return null;
    }
  }

  // Human-readable form with brackets: (01)...(17)...
  if (s.startsWith("(")) {
    const out: Array<[string, string]> = [];
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) out.push([m[1]!, (m[2] ?? "").trim()]);
    return out.length ? out : null;
  }

  // Raw form: optional symbology identifier, FNC1 as the GS character.
  const symbology = /^\](?:d2|C1|e0|Q3|J1)/.exec(s);
  const hadGs1Marker = Boolean(symbology) || s.startsWith(GS) || s.includes(GS);
  if (symbology) s = s.slice(symbology[0].length);
  if (s.startsWith(GS)) s = s.slice(1);
  if (!/^\d{2}/.test(s)) return null;
  // A plain 8-14 digit number is an ordinary product barcode, not GS1 data.
  if (!hadGs1Marker && /^\d{8,14}$/.test(s)) return null;

  const out: Array<[string, string]> = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    let ai: string;
    let fixed: number | null = null;
    let max = 30;
    if (two in FIXED) {
      ai = two;
      fixed = FIXED[two]!;
    } else if (two in VARIABLE) {
      ai = two;
      max = VARIABLE[two]!;
    } else if (/^3[1-6]$/.test(two)) {
      ai = s.slice(i, i + 4); // measures, e.g. 3103 net weight
      fixed = 6;
    } else if (two === "41") {
      ai = s.slice(i, i + 3);
      fixed = 13;
    } else if (/^(2[3-5]|4[0-3])$/.test(two)) {
      ai = s.slice(i, i + 3);
    } else if (/^[78]\d$/.test(two)) {
      ai = s.slice(i, i + 4);
      if (ai === "7003") fixed = 10;
    } else if (/^9\d$/.test(two)) {
      ai = two;
      max = 90;
    } else {
      return out.length ? out : null; // unknown AI: keep what we understood
    }
    if (!/^\d+$/.test(ai)) return out.length ? out : null;
    i += ai.length;
    let value: string;
    if (fixed !== null) {
      value = s.slice(i, i + fixed);
      i += fixed;
    } else {
      const end = s.indexOf(GS, i);
      const stop = end === -1 ? s.length : end;
      value = s.slice(i, Math.min(stop, i + max));
      i = Math.min(stop, i + max);
    }
    out.push([ai, value]);
  }
  // Without a GS1 marker, require at least one recognised element besides the GTIN.
  if (!hadGs1Marker && out.length < 2) return null;
  return out.length ? out : null;
}

/** Interprets any barcode text: GS1 data with dates, or a plain product number. */
export function parseBarcode(text: string, now: Date = new Date()): BarcodeData {
  const data: BarcodeData = {
    gtin: null,
    expiryDate: null,
    bestBeforeDate: null,
    sellByDate: null,
    productionDate: null,
    packagingDate: null,
    batch: null,
    isGs1: false,
  };
  const elements = parseGs1Elements(text);
  if (!elements) {
    const digits = text.trim();
    if (/^\d{8,14}$/.test(digits)) data.gtin = digits;
    return data;
  }
  data.isGs1 = true;
  for (const [ai, value] of elements) {
    if (ai === "01" || ai === "02") data.gtin = value.replace(/^0+(?=\d{13}$)/, "");
    else if (ai === "10") data.batch = value;
    else if (ai in DATE_AIS) data[DATE_AIS[ai as keyof typeof DATE_AIS]] = gs1Date(value, now);
    else if (ai === "7003") data.expiryDate ??= gs1Date(value.slice(0, 6), now);
  }
  return data;
}

/** The date to track: use-by/expiry first, then best-before, then sell-by. */
export function barcodeExpiry(data: BarcodeData): string | null {
  return data.expiryDate ?? data.bestBeforeDate ?? data.sellByDate;
}

/** The manufacturing date to show: production date, else packing date. */
export function barcodeManufacturing(data: BarcodeData): string | null {
  return data.productionDate ?? data.packagingDate;
}
