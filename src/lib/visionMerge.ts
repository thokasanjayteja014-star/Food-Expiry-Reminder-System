import { parseExpiryDate, type ExpiryParseResult } from "./dateParser";

export interface VisionAnswer {
  printedText: string;
  expiryDate: string | null;
  manufacturingDate: string | null;
  productName: string;
}

/**
 * Combines the AI reader's answer with our own parser run on the text it copied from the
 * pack. Our parser handles labels, month-only dates and "best before N months"; the AI's
 * own dates fill in what the text alone does not settle. Always asks the user to confirm.
 */
export function mergeVisionAnswer(answer: VisionAnswer, today?: string): ExpiryParseResult {
  const parse = parseExpiryDate(answer.printedText, { today });
  const expiry = parse.expiryDate ?? answer.expiryDate;
  if (!expiry) return { ...parse, manufacturingDate: parse.manufacturingDate ?? answer.manufacturingDate };
  const mfgCandidate = parse.manufacturingDate ?? answer.manufacturingDate;
  const mfg = mfgCandidate && mfgCandidate < expiry ? mfgCandidate : null;
  const agree = !answer.expiryDate || !parse.expiryDate || answer.expiryDate === parse.expiryDate;
  return {
    ...parse,
    expiryDate: expiry,
    suggestedExpiryDate: expiry,
    manufacturingDate: mfg,
    expirySource: parse.expiryDate ? parse.expirySource : "printed",
    precision: parse.precision ?? "day",
    confidence: agree ? "high" : "medium",
    alternatives: agree ? parse.alternatives : [...new Set([...(parse.alternatives ?? []), answer.expiryDate!].filter((d) => d !== expiry))],
    needsConfirmation: true,
    messages: agree ? parse.messages.filter((m) => !/not (confidently )?detected|enter the date manually/i.test(m)) : [...parse.messages, "Please confirm the expiry date."],
  };
}
