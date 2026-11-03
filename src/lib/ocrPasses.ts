/**
 * Multi-pass OCR for packaging.
 *
 * Expiry dates are usually a small block of inkjet or dot-matrix print in a big, busy
 * photo (lid rim, fingers, logos, glare). Tesseract reads such a photo badly, and any
 * single reading of dot-matrix digits is a coin toss between look-alikes (3/5, 0/8). So:
 *
 *   1. Find the blocks of printed text in the photo and zoom in on them, so characters
 *      are a size Tesseract reads well.
 *   2. Read each block several ways (plain, thresholded, with the dots joined).
 *   3. Take the expiry and manufacturing dates that most readings agree on.
 *
 * Whole-photo and rotated readings are a fallback when no text block is found.
 */
import { addDays, addMonths } from "./dates";
import { parseExpiryDate, type ExpiryParseResult } from "./dateParser";
import {
  binarize,
  blur,
  centre,
  clearBorder,
  cropBox,
  dotGap,
  scoreTextRegions,
  estimateSkew,
  flattenLight,
  joinDots,
  fitForOcr,
  invert,
  isMostlyDark,
  otsu,
  resize,
  rotate,
  rotateBy,
  rows,
  sharpen,
  splitLines,
  stretch,
  type GrayImage,
  type TextRegion,
} from "./ocrImage";

/** Tesseract page segmentation modes used here. */
export const PSM_BLOCK = 6;
export const PSM_SPARSE = 11;
export const PSM_LINE = 7;

export interface OcrReading {
  text: string;
  /** Tesseract's mean word confidence, 0-100. */
  confidence: number;
}

export type Recognize = (image: GrayImage, psm: number) => Promise<OcrReading>;

export interface PassResult extends OcrReading {
  pass: string;
  parse: ExpiryParseResult;
  score: number;
}

export interface MultiPassResult {
  /** The reading shown to the user, with the agreed dates filled in. */
  best: PassResult;
  tried: PassResult[];
  /** How many readings agreed on the chosen expiry date. */
  agreement: number;
}

/** Character height (px) that Tesseract reads best. */
const TARGET_CHAR_HEIGHT = 44;

interface Variant {
  name: string;
  psm: number;
  /** Extra zoom on top of the size normalisation. */
  zoom?: number;
  prepare: (img: GrayImage) => GrayImage;
}

/** Ways to read one zoomed-in text block, best first (measured on real dot-matrix labels). */
const BLOCK_VARIANTS: Variant[] = [
  { name: "threshold", psm: PSM_BLOCK, prepare: (g) => otsu(stretch(g)) },
  { name: "plain", psm: PSM_BLOCK, prepare: (g) => stretch(g) },
  { name: "dots joined", psm: PSM_BLOCK, prepare: (g) => otsu(blur(stretch(g), 2)) },
  { name: "local threshold, large", psm: PSM_BLOCK, zoom: 1.6, prepare: (g) => binarize(blur(stretch(g), 2), 61, 0.15) },
  { name: "sharpened", psm: PSM_BLOCK, zoom: 0.75, prepare: (g) => sharpen(stretch(g)) },
  { name: "dots joined, small", psm: PSM_BLOCK, zoom: 0.75, prepare: (g) => otsu(blur(stretch(g), 1)) },
  { name: "dots joined, large", psm: PSM_BLOCK, zoom: 1.4, prepare: (g) => otsu(blur(stretch(g), 3)) },
  { name: "local threshold", psm: PSM_BLOCK, prepare: (g) => binarize(blur(stretch(g), 1), 61, 0.15) },
  { name: "sparse", psm: PSM_SPARSE, prepare: (g) => stretch(g) },
  // Extra readings, only reached while the dates are still disputed.
  { name: "threshold, small", psm: PSM_BLOCK, zoom: 0.6, prepare: (g) => otsu(stretch(g)) },
  { name: "threshold, large", psm: PSM_BLOCK, zoom: 1.25, prepare: (g) => otsu(stretch(g)) },
  { name: "plain, large", psm: PSM_BLOCK, zoom: 1.6, prepare: (g) => stretch(g) },
  { name: "dots joined, very large", psm: PSM_BLOCK, zoom: 1.8, prepare: (g) => otsu(blur(stretch(g), 3)) },
];

/**
 * Readings of a block after evening out the light and levelling tilted text: for dot-matrix
 * print on shiny cans and tilted photos, where a plain threshold loses half the characters.
 * Each line is also read on its own, which Tesseract does far better than a skewed block.
 */
interface Levelled {
  image: GrayImage;
  lines: Array<[number, number]>;
  /** How far to grow the dots so they join into strokes. */
  grow: number;
}

function levelBlock(zoomed: GrayImage): Levelled {
  const flat = flattenLight(stretch(zoomed), Math.round(TARGET_CHAR_HEIGHT * 0.7));
  const angle = estimateSkew(clearBorder(otsu(blur(stretch(flat), 2))));
  const image = rotateBy(flat, -angle);
  const gap = dotGap(clearBorder(otsu(stretch(image))), Math.round(TARGET_CHAR_HEIGHT * 0.3));
  // Unknown spacing (faint or blotchy print): a join that suits typical can-bottom dots.
  const grow = gap ? Math.min(6, Math.max(2, Math.ceil(gap / 2) + 1)) : 4;
  const lines = splitLines(closeDots(image, grow + 1), Math.round(TARGET_CHAR_HEIGHT * 0.45));
  return { image, lines, grow };
}

/** Black-on-white with the dots joined and the dark surroundings of the label removed. */
function closeDots(g: GrayImage, grow: number): GrayImage {
  const bin = clearBorder(otsu(blur(stretch(g), 1)));
  return grow > 0 ? joinDots(bin, grow, grow - 1) : bin;
}

function lineImage(l: Levelled, index: number, scale = 1): GrayImage | null {
  const line = l.lines[index];
  if (!line) return null;
  const pad = (line[1] - line[0]) * 0.35;
  const strip = rows(l.image, line[0] - pad, line[1] + pad);
  return closeDots(scale === 1 ? strip : resize(strip, strip.width * scale, strip.height * scale), Math.round(l.grow * scale));
}

/** Where the levelled readings go in a block's reading order, and how many lines are read. */
const MAX_LINES = 4;

/** Whole-photo readings, used when no text block is found or blocks gave no date. */
const PHOTO_VARIANTS: Variant[] = [
  { name: "photo, sparse", psm: PSM_SPARSE, prepare: (g) => sharpen(stretch(fitForOcr(g))) },
  { name: "photo centre, block", psm: PSM_BLOCK, prepare: (g) => stretch(fitForOcr(centre(g, 0.6))) },
  { name: "photo centre, threshold", psm: PSM_BLOCK, prepare: (g) => otsu(blur(stretch(fitForOcr(centre(g, 0.6))), 1)) },
  { name: "rotated 90", psm: PSM_SPARSE, prepare: (g) => stretch(fitForOcr(rotate(centre(g, 0.8), 90))) },
  { name: "rotated 270", psm: PSM_SPARSE, prepare: (g) => stretch(fitForOcr(rotate(centre(g, 0.8), 270))) },
  { name: "upside down", psm: PSM_SPARSE, prepare: (g) => stretch(fitForOcr(rotate(g, 180))) },
];

/** How believable one reading is on its own: confident expiry > any date; MFG and labels add. */
export function scoreParse(parse: ExpiryParseResult, ocrConfidence: number): number {
  let score = 0;
  if (parse.expiryDate) score += parse.confidence === "high" ? 120 : 100;
  else if (parse.suggestedExpiryDate) score += 40;
  if (parse.manufacturingDate) {
    score += 30;
    if (parse.expiryDate && parse.manufacturingDate < parse.expiryDate) score += 10;
  }
  score += 5 * Math.min(4, parse.candidates.filter((c) => c.role !== "unknown").length);
  if (parse.messages.some((m) => /before the manufacturing date|unusual/.test(m))) score -= 40;
  return score + ocrConfidence / 20;
}

/** Finds the text blocks on a reduced copy (fast), in the coordinates of `img`. */
export function locateText(img: GrayImage): TextRegion[] {
  const small = fitForOcr(img, 1400, 0);
  const k = img.width / small.width;
  const r = Math.max(1, Math.round(Math.min(small.width, small.height) / 600));
  const window = Math.max(25, Math.round(Math.min(small.width, small.height) / 20) | 1);
  const gray = stretch(small);
  const bin = binarize(blur(gray, r), window, 0.15);
  const fine = scoreTextRegions(bin, gray);
  // Widely spaced dot-matrix dots only join into characters once grown together. Where that
  // finds the same block with much taller characters, the fine pass was reading single dots
  // as characters.
  const coarse = scoreTextRegions(joinDots(bin, r + 1, r), gray);
  const regions = fine.map((f) => {
    const c = coarse.find((c) => overlap(f, c) > 0.5 && c.charHeight > f.charHeight * 2.5 && c.blobs >= 4);
    return c ?? f;
  });
  for (const c of coarse) if (!regions.some((f) => overlap(f, c) > 0.3)) regions.push({ ...c, score: c.score * 0.8 });
  const unique = regions.filter((a, i) => regions.findIndex((b) => b === a) === i).sort((a, b) => b.score - a.score);
  return unique.slice(0, 3).map((t) => ({
    x: Math.round(t.x * k),
    y: Math.round(t.y * k),
    width: Math.round(t.width * k),
    height: Math.round(t.height * k),
    blobs: t.blobs,
    charHeight: t.charHeight * k,
  }));
}

/** Share of the smaller box covered by the other. */
function overlap(a: TextRegion, b: TextRegion): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}

/** Crops a text block with a margin and scales it so characters are ~44 px tall. */
export function zoomToRegion(img: GrayImage, region: TextRegion, zoom = 1): GrayImage {
  const block = cropBox(img, region, Math.round(region.charHeight * 1.5));
  let scale = (TARGET_CHAR_HEIGHT / Math.max(4, region.charHeight)) * zoom;
  scale = Math.min(4, Math.max(0.5, scale));
  scale = Math.min(scale, 2400 / Math.max(block.width, block.height));
  return resize(block, block.width * scale, block.height * scale);
}

/** Common shelf lives in months. Packs print EXP = MFG + N months, often minus a day. */
const SHELF_LIVES = [1, 2, 3, 4, 6, 9, 12, 18, 24, 36];

/**
 * 1 when the MFG and EXP dates are a standard shelf life apart (e.g. 10/10/2026 and
 * 09/04/2027 are 6 months less a day), 0.5 when close, else 0. Used only to choose
 * between MFG readings that differ by a misread digit.
 */
export function shelfLifeFit(mfg: string, exp: string): number {
  let best = Infinity;
  for (const n of SHELF_LIVES) {
    const end = addMonths(mfg, n);
    for (const candidate of [end, addDays(end, -1)]) {
      const d = Math.abs((Date.parse(candidate) - Date.parse(exp)) / 86_400_000);
      best = Math.min(best, d);
    }
    // Month-only dates: MFG 03/2025 (1st) and EXP 02/2028 (last day) are 36 months apart.
    const monthEnd = addDays(addMonths(mfg.slice(0, 8) + "01", n), -1);
    best = Math.min(best, Math.abs((Date.parse(monthEnd) - Date.parse(exp)) / 86_400_000));
  }
  return best <= 2 ? 1 : best <= 7 ? 0.5 : 0;
}

/**
 * Rebuilds a year that readings disagree on digit by digit. "APRIL / 2074", "2078",
 * "2028", "2023" share most digits; the plausible year closest to all of them (2028)
 * is the likely print. Returns null when no plausible year is supported.
 */
export function consensusYear(years: string[], today: string, fits: (year: string) => number = () => 0): string | null {
  const ys = years.filter((y) => /^\d{4}$/.test(y));
  if (ys.length < 2) return null;
  const now = Number(today.slice(0, 4));
  const options = [0, 1, 2, 3].map((i) => {
    const counts = new Map<string, number>();
    for (const y of ys) counts.set(y[i]!, (counts.get(y[i]!) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
  });
  let best: [string, number] | null = null;
  for (const a of options[0]!) for (const b of options[1]!) for (const c of options[2]!) for (const d of options[3]!) {
    const y = a + b + c + d;
    if (Number(y) < now - 2 || Number(y) > now + 10) continue;
    let score = 0;
    for (const other of ys) for (let i = 0; i < 4; i++) if (other[i] === y[i]) score++;
    score += 1.5 * fits(y);
    if (!best || score > best[1]) best = [y, score];
  }
  return best?.[0] ?? null;
}

class Votes {
  private counts = new Map<string, number>();
  add(key: string | null | undefined, weight = 1) {
    if (key) this.counts.set(key, (this.counts.get(key) ?? 0) + weight);
  }
  top(filter: (key: string) => boolean = () => true): [string, number] | null {
    return this.ranked(filter)[0] ?? null;
  }
  ranked(filter: (key: string) => boolean = () => true): Array<[string, number]> {
    return [...this.counts].filter(([k]) => filter(k)).sort((a, b) => b[1] - a[1]);
  }
}

function votesOf(key: string): Votes {
  const v = new Votes();
  v.add(key);
  return v;
}

export async function readWithPasses(
  photo: GrayImage,
  recognize: Recognize,
  options: { today?: string; maxPasses?: number; onPass?: (done: number, planned: number) => void } = {},
): Promise<MultiPassResult> {
  const maxPasses = options.maxPasses ?? 14;
  // Dark text on a light background is the norm; try light-on-dark only if nothing is found.
  let source = photo;
  let regions = locateText(photo);
  if (regions.length === 0) {
    const inverted = invert(photo);
    const found = locateText(inverted);
    if (found.length > 0) [source, regions] = [inverted, found];
  }
  const tried: PassResult[] = [];

  type Step = { name: string; psm: number; image: () => GrayImage | null };
  const blockPlans: Step[][] = regions.map((region, i) => {
    const prefix = `text block ${i + 1},`;
    let levelled: Levelled | undefined;
    const level = () => (levelled ??= levelBlock(zoomToRegion(source, region)));
    const variant = (v: Variant): Step => ({ name: `${prefix} ${v.name}`, psm: v.psm, image: () => v.prepare(zoomToRegion(source, region, v.zoom)) });
    const lineSteps = (scale: number, label: string): Step[] =>
      Array.from({ length: MAX_LINES }, (_, k) => ({
        name: `${prefix} line ${k + 1}, ${label}`,
        psm: PSM_LINE,
        image: () => lineImage(level(), k, scale),
      }));
    return [
      ...BLOCK_VARIANTS.slice(0, 2).map(variant),
      { name: `${prefix} levelled, dots closed`, psm: PSM_BLOCK, image: () => closeDots(level().image, level().grow) },
      ...lineSteps(1, "dots closed"),
      ...BLOCK_VARIANTS.slice(2, 4).map(variant),
      ...lineSteps(0.6, "dots closed, small"),
      ...BLOCK_VARIANTS.slice(4).map(variant),
    ];
  });
  const wholePhoto = isMostlyDark(photo) ? invert(photo) : photo;
  const photoPlan = PHOTO_VARIANTS.map((v) => ({ name: v.name, psm: v.psm, image: () => v.prepare(wholePhoto) }));

  const expiryVotes = new Votes();
  const mfgVotes = new Votes();
  const settled = () => {
    const exp = expiryVotes.top();
    if (!exp || exp[1] < 3) return false;
    const [mfg, runnerUp] = rankMfg(mfgVotes, exp[0]);
    const anyMfg = tried.some((t) => t.parse.manufacturingDate);
    // MFG digits are often misread (3 vs 5), so it must lead clearly, not just exist.
    // An MFG that is not a standard shelf life before the expiry may be a misread digit: read on.
    const standard = mfg !== undefined && (shelfLifeFit(mfg[0], exp[0]) === 1 || tried.length >= 12);
    return (standard && mfg[1] >= 3 && mfg[1] >= (runnerUp?.[1] ?? 0) + 2) || (!anyMfg && tried.length >= 4);
  };

  const planned = blockPlans.reduce((n, p) => n + p.length, 0) + photoPlan.length;
  const done = new Set<Step>();
  const run = async (step: Step): Promise<boolean> => {
    done.add(step);
    const image = step.image();
    if (!image) return false;
    options.onPass?.(tried.length, Math.min(maxPasses, planned));
    const reading = await recognize(image, step.psm);
    const parse = parseExpiryDate(reading.text, { today: options.today });
    const result: PassResult = { ...reading, pass: step.name, parse, score: scoreParse(parse, reading.confidence) };
    tried.push(result);
    if (parse.expiryDate) expiryVotes.add(parse.expiryDate, parse.confidence === "high" ? 1 : 0.6);
    else if (parse.suggestedExpiryDate) expiryVotes.add(parse.suggestedExpiryDate, 0.3);
    mfgVotes.add(parse.manufacturingDate);
    return true;
  };

  // Text blocks first, one block at a time; move to the next block only if this one gave no expiry.
  const setAside: number[] = [];
  const hasExpiry = (t: PassResult) => t.parse.candidates.some((c) => c.role === "expiry") || Boolean(t.parse.suggestedExpiryDate);
  for (let r = 0; r < regions.length && !settled() && (expiryVotes.top()?.[1] ?? 0) < 2; r++) {
    const before = tried.length;
    for (const step of blockPlans[r]!) {
      if (tried.length >= maxPasses || settled()) break;
      // Expiry agreed on and an earlier block may hold the MFG: go back to that block.
      if (setAside.length > 0 && (expiryVotes.top()?.[1] ?? 0) >= 2) break;
      if (!(await run(step))) continue;
      const sofar = tried.slice(before);
      if (sofar.length !== 4) continue;
      // A block with no dates and hardly any digits after four readings is probably the product name.
      const digits = sofar.reduce((n, t) => n + (t.text.match(/\d/g)?.length ?? 0), 0);
      if (!sofar.some((t) => t.parse.candidates.length > 0) && digits < 6) break;
      // No expiry in this block (cans print MFG and EXP apart): read the next one, and come
      // back to this one below if its manufacturing date is still missing.
      if (r < regions.length - 1 && !sofar.some(hasExpiry)) {
        setAside.push(r);
        break;
      }
    }
  }
  // Use the readings skipped above: for the expiry if none was found, else for a missing MFG.
  const leftovers = [...setAside.flatMap((r) => blockPlans[r]!), ...blockPlans.flat()];
  // A few extra readings for an MFG printed apart from the expiry (cans).
  const budget = maxPasses + (setAside.length > 0 && expiryVotes.top() ? 4 : 0);
  for (const step of leftovers) {
    if (tried.length >= budget || settled()) break;
    const exp = expiryVotes.top();
    if (exp && (setAside.length === 0 || rankMfg(mfgVotes, exp[0]).length > 0)) break;
    if (!done.has(step)) await run(step);
  }
  if (!expiryVotes.top()) {
    for (const step of photoPlan) {
      await run(step);
      if ((expiryVotes.top()?.[1] ?? 0) >= 1) break;
    }
  }

  repairExpiryYear(tried, expiryVotes, mfgVotes, options.today ?? new Date().toISOString().slice(0, 10));
  repairMfgYear(expiryVotes, mfgVotes);
  return { ...combine(tried, expiryVotes, mfgVotes), tried };
}

/**
 * When readings agree on the expiry month but not the year (dot-matrix 2/7, 8/3 misreads),
 * votes for the year rebuilt digit by digit from all of them.
 */
function repairExpiryYear(tried: PassResult[], expiryVotes: Votes, mfgVotes: Votes, today: string) {
  const groups = new Map<string, string[]>();
  for (const t of tried) {
    for (const c of t.parse.candidates) {
      if (c.role !== "expiry") continue;
      const key = `${c.precision}|${c.date.slice(5, 7)}|${c.precision === "day" ? c.date.slice(8) : ""}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(c.date.slice(0, 4));
    }
  }
  const mfg = mfgVotes.top()?.[0];
  for (const [key, years] of groups) {
    const [precision, mm, dd] = key.split("|") as [string, string, string];
    const dateFor = (y: string) =>
      precision === "month" ? addDays(addMonths(`${y}-${mm}-01`, 1), -1) : `${y}-${mm}-${dd}`;
    const year = consensusYear(years, today, (y) => (mfg && mfg < dateFor(y) ? shelfLifeFit(mfg, dateFor(y)) : 0));
    if (!year) continue;
    const date = dateFor(year);
    if (mfg && date <= mfg) continue;
    const exact = years.filter((y) => y === year).length;
    expiryVotes.add(date, 0.5 * (years.length - exact));
  }
}

/** Digits dot-matrix print turns into each other. */
const LOOKALIKE_DIGITS: Record<string, string> = { "0": "289", "2": "07", "3": "58", "5": "36", "6": "58", "8": "0369", "7": "21", "1": "7" };

/**
 * An MFG years before the expiry is a misread digit ("22/04/06" for 22/04/26): votes for the
 * look-alike year that puts it a normal shelf life before the expiry.
 */
function repairMfgYear(expiryVotes: Votes, mfgVotes: Votes) {
  const exp = expiryVotes.top()?.[0];
  if (!exp) return;
  const expYear = Number(exp.slice(0, 4));
  for (const [mfg, votes] of mfgVotes.ranked()) {
    if (expYear - Number(mfg.slice(0, 4)) <= 5) continue;
    const yy = mfg.slice(2, 4);
    let best: [string, number] | null = null;
    for (let pos = 0; pos < 2; pos++) {
      for (const d of LOOKALIKE_DIGITS[yy[pos]!] ?? "") {
        const alt = `${mfg.slice(0, 2)}${pos === 0 ? d + yy[1] : yy[0] + d}${mfg.slice(4)}`;
        const gap = expYear - Number(alt.slice(0, 4));
        if (alt >= exp || gap > 3) continue;
        const fit = shelfLifeFit(alt, exp) + 0.1;
        if (!best || fit > best[1]) best = [alt, fit];
      }
    }
    if (best) mfgVotes.add(best[0], 0.6 * votes);
  }
  // A day or month digit off by a look-alike ("16/10/2026" for 10/10/2026): when swapping it
  // gives an exact standard shelf life (6 months less a day), that reading gets some votes.
  for (const [mfg, votes] of mfgVotes.ranked((k) => k < exp)) {
    if (shelfLifeFit(mfg, exp) === 1) continue;
    for (const pos of [5, 6, 8, 9]) {
      for (const d of LOOKALIKE_DIGITS[mfg[pos]!] ?? "") {
        const alt = mfg.slice(0, pos) + d + mfg.slice(pos + 1);
        if (alt >= exp || Number.isNaN(Date.parse(alt)) || new Date(alt).toISOString().slice(0, 10) !== alt) continue;
        if (shelfLifeFit(alt, exp) === 1) mfgVotes.add(alt, Math.min(0.7 * votes, 1.4));
      }
    }
  }
}

/** MFG readings before the expiry, ranked by votes plus a bonus for a standard shelf life. */
function rankMfg(votes: Votes, expiry: string): Array<[string, number]> {
  return votes
    // Food is not made more than five years before it expires; older is a misread year.
    .ranked((k) => k < expiry && Number(expiry.slice(0, 4)) - Number(k.slice(0, 4)) <= 5)
    .map(([k, v]): [string, number] => [k, v + 1.5 * shelfLifeFit(k, expiry)])
    .sort((a, b) => b[1] - a[1]);
}

/** Picks the agreed dates and the reading that best supports them. */
function combine(tried: PassResult[], expiryVotes: Votes, mfgVotes: Votes): Omit<MultiPassResult, "tried"> {
  const exp = expiryVotes.top();
  if (!exp) {
    const best = [...tried].sort((a, b) => b.score - a.score)[0]!;
    return { best, agreement: 0 };
  }
  const [expiry, agreement] = exp;
  const supporting = tried.filter((t) => (t.parse.expiryDate ?? t.parse.suggestedExpiryDate) === expiry);
  const base = [...supporting].sort((a, b) => b.score - a.score)[0]!;
  const mfg = rankMfg(mfgVotes, expiry)[0]?.[0] ?? null;
  // A lone reading is still a guess; agreement between readings makes it a confident one.
  const confident = Boolean(base.parse.expiryDate) || agreement >= 2 || supporting.length >= 2;
  const parse: ExpiryParseResult = {
    ...base.parse,
    expiryDate: confident ? expiry : null,
    suggestedExpiryDate: expiry,
    manufacturingDate: mfg ?? (base.parse.manufacturingDate && rankMfg(votesOf(base.parse.manufacturingDate), expiry).length ? base.parse.manufacturingDate : null),
    messages: base.parse.messages.filter((m) => !(mfg && /before the manufacturing date/.test(m))),
  };
  return { best: { ...base, parse, score: scoreParse(parse, base.confidence) }, agreement: Math.round(agreement) };
}
