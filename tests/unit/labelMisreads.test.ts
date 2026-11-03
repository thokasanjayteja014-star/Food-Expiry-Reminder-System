import { describe, expect, it } from "vitest";
import { parseExpiryDate } from "@/lib/dateParser";
import { shelfLifeFit } from "@/lib/ocrPasses";

const today = "2026-11-03";

describe("dot-matrix and inkjet label wording", () => {
  it("reads MFG.DT / EXPIRY DT month dates", () => {
    const r = parseExpiryDate("B.NO.AS2504\nMFG.DT.03/2025\nEXPIRY DT.02/2028\nM.R.P.Rs.113.00", { today });
    expect(r.expiryDate).toBe("2028-02-29");
    expect(r.manufacturingDate).toBe("2025-03-01");
  });

  it("fixes common letter misreads of MFG and DT", () => {
    expect(parseExpiryDate("WEG. 0703/2025\nEXPIRY DT.02/2028", { today }).manufacturingDate).toBe("2025-03-01");
  });

  it("keeps a real day of 07 after MFG", () => {
    const r = parseExpiryDate("MFG 07.03.2025 EXP 06.03.2027", { today });
    expect(r.manufacturingDate).toBe("2025-03-07");
    expect(r.expiryDate).toBe("2027-03-06");
  });

  it("reads M.F.D. and E.X.P. spelled with dots", () => {
    const r = parseExpiryDate("M.F.D. 10/10/2026 E.X.P. 09/04/2027", { today });
    expect(r.expiryDate).toBe("2027-04-09");
    expect(r.manufacturingDate).toBe("2026-10-10");
  });
});

describe("shelfLifeFit", () => {
  it("recognises standard shelf lives", () => {
    expect(shelfLifeFit("2026-10-10", "2027-04-09")).toBe(1); // 6 months less a day
    expect(shelfLifeFit("2025-03-01", "2028-02-29")).toBe(1); // 36 months, month-only
    expect(shelfLifeFit("2026-10-16", "2027-04-09")).toBeLessThan(1);
    expect(shelfLifeFit("2026-08-23", "2027-04-09")).toBe(0);
  });
});
