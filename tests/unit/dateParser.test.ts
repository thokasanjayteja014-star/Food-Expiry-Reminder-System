import { describe, expect, it } from "vitest";
import { MESSAGES, normaliseOcrText, parseExpiryDate } from "@/lib/dateParser";

const today = "2026-10-07";
const parse = (text: string) => parseExpiryDate(text, { today });

describe("parseExpiryDate: formats from the spec", () => {
  it.each([
    ["EXP: 20/10/2026", "2026-10-20"],
    ["EXP 20-10-2026", "2026-10-20"],
    ["EXP. 20.10.2026", "2026-10-20"],
    ["EXP: 20/10/26", "2026-10-20"],
    ["EXP OCT 20 2026", "2026-10-20"],
    ["BEST BEFORE: 20/10/2026", "2026-10-20"],
    ["EXPIRY DATE: 20 OCT 2026", "2026-10-20"],
    ["Expires 20-Oct-26", "2026-10-20"],
    ["USE BY 2026-10-20", "2026-10-20"],
    ["BBE 20OCT2026", "2026-10-20"],
    ["EXP: 20th October 2026", "2026-10-20"],
  ])("%s -> %s", (text, expected) => {
    const r = parse(text);
    expect(r.expiryDate).toBe(expected);
    expect(r.confidence).toBe("high");
    expect(r.expirySource).toBe("printed");
    expect(r.ambiguous).toBe(false);
  });

  it("month-only dates use the last day of the month", () => {
    for (const text of ["EXP: OCT 2026", "EXP 10/2026", "BEST BEFORE OCT-26", "USE BY 10/27"]) {
      const r = parse(text);
      expect(r.precision, text).toBe("month");
      expect(r.expiryDate, text).toBe(text.includes("27") ? "2027-10-31" : "2026-10-31");
    }
  });
});

describe("parseExpiryDate: choosing between dates", () => {
  it("picks the EXP date over the MFG date", () => {
    const r = parse("MILK\nMFG: 10/10/2026\nEXP: 20/10/2026");
    expect(r.expiryDate).toBe("2026-10-20");
    expect(r.manufacturingDate).toBe("2026-10-10");
    expect(r.confidence).toBe("high");
  });

  it("handles MFG and EXP on the same line", () => {
    const r = parse("PKD 01/10/2026 USE BY 15/10/2026 MRP RS 30.00");
    expect(r.manufacturingDate).toBe("2026-10-01");
    expect(r.expiryDate).toBe("2026-10-15");
  });

  it("handles labels on one line and dates on the next (column layout)", () => {
    const r = parse("PKD        EXP\n01/10/2026  15/10/2026");
    expect(r.manufacturingDate).toBe("2026-10-01");
    expect(r.expiryDate).toBe("2026-10-15");
    expect(r.confidence).toBe("high");
  });

  it("with unlabelled multiple dates, suggests the latest but is not confident", () => {
    const r = parse("10/10/2026\n20/10/2026");
    expect(r.expiryDate).toBeNull();
    expect(r.suggestedExpiryDate).toBe("2026-10-20");
    expect(r.confidence).toBe("low");
    expect(r.messages[0]).toBe(MESSAGES.notConfident);
  });

  it("reports when no date is found", () => {
    const r = parse("FRESH MILK\nTONED\n500 ML\nMRP 30.00");
    expect(r.expiryDate).toBeNull();
    expect(r.suggestedExpiryDate).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.messages[0]).toBe(MESSAGES.notFound);
  });

  it("returns nothing for empty text", () => {
    expect(parse("").confidence).toBe("none");
  });

  it("flags two different expiry dates", () => {
    const r = parse("EXP 20/10/2026\nEXP 25/10/2026");
    expect(r.expiryDate).toBe("2026-10-20");
    expect(r.confidence).toBe("medium");
    expect(r.alternatives).toContain("2026-10-25");
  });
});

describe("parseExpiryDate: best-before calculations", () => {
  it("calculates 'best before 6 months' from MFG and marks it calculated", () => {
    const r = parse("MFG: 10/03/2026\nBEST BEFORE: 6 MONTHS");
    expect(r.expiryDate).toBe("2026-09-10");
    expect(r.expirySource).toBe("calculated");
    expect(r.messages.join(" ")).toContain(MESSAGES.calculated);
    expect(r.needsConfirmation).toBe(true);
  });

  it("supports 'best before six months from manufacture'", () => {
    const r = parse("PKD 15 JAN 2026\nBEST BEFORE SIX MONTHS FROM MANUFACTURE");
    expect(r.expiryDate).toBe("2026-07-15");
    expect(r.expirySource).toBe("calculated");
  });

  it("clamps month arithmetic at month end", () => {
    const r = parse("MFD 31/08/2026\nUSE WITHIN 6 MONTHS");
    expect(r.expiryDate).toBe("2027-02-28");
  });

  it("supports day-based shelf life", () => {
    const r = parse("PKD: 01/10/2026\nBest before 180 days from packaging");
    expect(r.expiryDate).toBe("2027-03-30");
  });

  it("cannot calculate without a manufacturing date", () => {
    const r = parse("BEST BEFORE 6 MONTHS FROM MFG");
    expect(r.expiryDate).toBeNull();
    expect(r.confidence).toBe("none");
  });
});

describe("parseExpiryDate: ambiguous and invalid dates", () => {
  it("does not silently guess 05/06/2026", () => {
    const r = parse("EXP: 05/06/2027");
    expect(r.ambiguous).toBe(true);
    expect(r.needsConfirmation).toBe(true);
    expect(r.expiryDate).toBe("2027-06-05"); // day-first default
    expect(r.alternatives).toContain("2027-05-06");
    expect(r.messages.join(" ")).toContain(MESSAGES.ambiguous);
  });

  it("supports month-first preference", () => {
    const r = parseExpiryDate("EXP: 05/06/2027", { today, preferDayFirst: false });
    expect(r.expiryDate).toBe("2027-05-06");
    expect(r.alternatives).toContain("2027-06-05");
  });

  it("resolves ambiguity from another unambiguous date on the pack", () => {
    const r = parse("MFG: 25/09/2026\nEXP: 05/11/2026");
    expect(r.ambiguous).toBe(false);
    expect(r.expiryDate).toBe("2026-11-05");
  });

  it("uses the MFG date to rule out an impossible reading", () => {
    // 11/10 as MM/DD = 10 Nov... MFG is 12 Oct, so DD/MM (11 Oct) is impossible.
    const r = parse("MFG 12 OCT 2026\nEXP 11/10/2026");
    expect(r.ambiguous).toBe(false);
    expect(r.expiryDate).toBe("2026-11-10");
  });

  it("reads MM/DD when the day is above 12", () => {
    expect(parse("EXP 10/20/2026").expiryDate).toBe("2026-10-20");
  });

  it("rejects impossible dates", () => {
    for (const text of ["EXP: 31/02/2026", "EXP: 32/10/2026", "EXP 45/45/2026", "EXP: 00/10/2026"]) {
      const r = parse(text);
      expect(r.expiryDate, text).toBeNull();
      expect(r.confidence, text).toBe("none");
    }
  });

  it("accepts 29 Feb only in leap years", () => {
    expect(parse("EXP 29/02/2028").expiryDate).toBe("2028-02-29");
    expect(parse("EXP 29/02/2027").expiryDate).toBeNull();
  });

  it("lowers confidence when expiry is before manufacturing", () => {
    const r = parse("MFG 20/10/2026\nEXP 10 OCT 2026");
    expect(r.confidence).toBe("low");
    expect(r.expiryDate).toBeNull();
  });

  it("lowers confidence for implausible years", () => {
    expect(parse("EXP 20/10/2045").confidence).toBe("low");
  });
});

describe("OCR noise handling", () => {
  it("fixes O/I misreads inside dates", () => {
    expect(parse("EXP: 2O/1O/2O26").expiryDate).toBe("2026-10-20");
    expect(parse("EXP: 2I/1O/2026").expiryDate).toBe("2026-10-21");
  });

  it("tolerates spaces around separators", () => {
    expect(parse("EXP : 20 / 10 / 2026").expiryDate).toBe("2026-10-20");
  });

  it("ignores prices and batch numbers", () => {
    const r = parse("MRP RS 45.00\nBATCH NO 2310\nNET WT 200 G\nEXP 20/10/2026");
    expect(r.candidates).toHaveLength(1);
    expect(r.expiryDate).toBe("2026-10-20");
  });

  it("normalises text", () => {
    expect(normaliseOcrText("exp :  20 - 10 - 2026")).toBe("EXP : 20-10-2026");
  });
});
