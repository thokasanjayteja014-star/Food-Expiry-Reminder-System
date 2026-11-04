import { describe, expect, it } from "vitest";
import { parseExpiryDate } from "@/lib/dateParser";

/**
 * Date formats printed on food packs in India (FSSAI), the EU/UK, the US and Canada:
 * [text after OCR, expected expiry, expected manufacturing date or null if not checked].
 */
const FORMATS: Array<[string, string | null, string | null]> = [
  ["MFG 20/10/2026 EXP 19/10/2027", "2027-10-19", "2026-10-20"],
  ["MFD: 20-10-2026 EXP: 19-04-2027", "2027-04-19", "2026-10-20"],
  ["Mfg. Date 20.10.2026 Exp. Date 19.04.2027", "2027-04-19", "2026-10-20"],
  ["DATE OF MFG. 20 10 2026 BEST BEFORE 19 04 2027", "2027-04-19", "2026-10-20"],
  ["MFG 201026 EXP 190427", "2027-04-19", "2026-10-20"],
  ["MFG 20102026 EXP 19042027", "2027-04-19", "2026-10-20"],
  ["EXP 2027-04-19", "2027-04-19", null],
  ["EXP 2027/04/19", "2027-04-19", null],
  ["EXP 20270419", "2027-04-19", null],
  ["BEST BEFORE 19 APR 2027", "2027-04-19", null],
  ["BB 19APR2027", "2027-04-19", null],
  ["EXP 19-APR-27", "2027-04-19", null],
  ["EXP APR 19 2027", "2027-04-19", null],
  ["BEST IF USED BY APR 19, 2027", "2027-04-19", null],
  ["BEST BEFORE END APR 2027", "2027-04-30", null],
  ["EXP APR-27", "2027-04-30", null],
  ["EXP APR/27", "2027-04-30", null],
  ["EXP APR'27", "2027-04-30", null],
  ["USE BY APRIL 2027", "2027-04-30", null],
  ["EXP 04/2027", "2027-04-30", null],
  ["EXP 04.2027", "2027-04-30", null],
  ["MFG 10/26 EXP 04/27", "2027-04-30", "2026-10-01"],
  ["BB/MA 2027 AL 19", "2027-04-19", null],
  ["BB/MA 2027 OC 31", "2027-10-31", null],
  ["PKD ON 20/10/2026\nBEST BEFORE 6 MONTHS FROM PACKAGING", "2027-04-20", "2026-10-20"],
  ["MFD 10/2026 BEST BEFORE 12 MONTHS FROM MANUFACTURE", "2027-09-30", "2026-10-01"],
  ["PKD 20/10/2026 USE WITHIN 180 DAYS", "2027-04-18", "2026-10-20"],
  ["D.O.M. 20/10/2026 USE BEFORE 9 MONTHS", "2027-07-20", "2026-10-20"],
  ["MANUFACTURED ON 20/10/2026 EXPIRES ON 19/10/2027", "2027-10-19", "2026-10-20"],
  ["PACKED ON: 20.10.26 USE BY: 25.10.26", "2026-10-25", "2026-10-20"],
  ["PROD 20/10/2026 SELL BY 30/10/2026", "2026-10-30", "2026-10-20"],
  ["DISPLAY UNTIL 30 OCT USE BY 01 NOV 2026", "2026-11-01", null],
  ["CONSUME BEFORE 01/11/2026", "2026-11-01", null],
  ["VALID UPTO 01/11/2026", "2026-11-01", null],
  ["BBE: 01.11.2026", "2026-11-01", null],
  ["MHD 01.11.2026", "2026-11-01", null],
  ["EXP. 01/11/26 L 26293 12:45", "2026-11-01", null],
  ["MFG 21/08/26 03:34 R70 USE BY 18/12/26", "2026-12-18", "2026-08-21"],
  ["B.NO.AS2504 MFG.DT.03/2025 EXPIRY DT.02/2028 M.R.P.Rs.113.00", "2028-02-29", "2025-03-01"],
  ["MRP Rs.20.00 (Incl. of all taxes) EXP 12/2027", "2027-12-31", null],
  ["MFG\tEXP\n10/26\t04/27", "2027-04-30", "2026-10-01"],
  ["Best before: 19/04/2027", "2027-04-19", null],
  ["exp 19/04/2027", "2027-04-19", null],
  ["E 19/04/2027", "2027-04-19", null],
  ["EXP:19.04.27", "2027-04-19", null],
  ["BEST BEFORE 18 MONTHS FROM MFG. MFG: JUN 2026", "2027-11-30", "2026-06-01"],
  ["MFD 06/2026 BEST BEFORE EIGHTEEN MONTHS FROM MFD", "2027-11-30", "2026-06-01"],
  ["JUN-26/DEC-27", "2027-12-31", "2026-06-01"],
  ["20/10/26 19/04/27", "2027-04-19", "2026-10-20"],
  ["MFG 2026.10.20 EXP 2027.10.19", "2027-10-19", "2026-10-20"],
  ["USE BY 19 APRIL 2027", "2027-04-19", null],
  ["EXPIRY: 19TH APRIL 2027", "2027-04-19", null],
  ["BEST BEFORE 31 DEC. 2027", "2027-12-31", null],
  ["EXP 31-DEC-2027", "2027-12-31", null],
  ["EXP: 31 DECEMBER, 2027", "2027-12-31", null],
  ["BEST BEFORE: SEE CAP\n19/04/2027", "2027-04-19", null],
  ["P 20/10/26 E 19/04/27", "2027-04-19", "2026-10-20"],
  ["M 20/10/26 E 19/04/27", "2027-04-19", "2026-10-20"],
  ["BBD 19/04/2027", "2027-04-19", null],
  ["EXP DATE 19-04-2027", "2027-04-19", null],
  ["Expiry Date: Apr 2027", "2027-04-30", null],
  // One label pair, then both dates in the same order (snack packs).
  ["MFD./USE BY: 20 AUG 26 /15 FEB 27", "2027-02-15", "2026-08-20"],
  ["MFD. / USE BY:\n20 AUG 26 /15 FEB 27", "2027-02-15", "2026-08-20"],
  ["MFD.\n/USE BY:\nNET WT.:\n2.9/ER220H6^/0.34\n20 AUG 26 /15 FEB 27\n58g", "2027-02-15", "2026-08-20"],
];
const NOT_DATES = ["MRP Rs. 113.00 incl. of all taxes", "Net Wt. 500 g", "FSSAI Lic. No. 10020021005479", "Batch No. 250412", "Customer care 1800 22 4020", "P.O. BOX 27 GURUGRAM-122002", "M 250 ml E 10 kcal", "Energy 120 kcal Protein 3.5 g Fat 10.2 g", "Ph: +91 9876543210", "Pin 363760", "Store below 25 C. Use within 2 days of opening", "Rs.20.00/-(USP Rs 0.08/-PER ML)", "B.NO. 222 MRP 10/-"];

const today = "2026-11-03";

describe("pack date formats", () => {
  it.each(FORMATS)("%s", (text, expiry, mfg) => {
    const r = parseExpiryDate(text, { today });
    expect(r.expiryDate).toBe(expiry);
    if (mfg) expect(r.manufacturingDate).toBe(mfg);
  });

  it.each(NOT_DATES)("finds no date in %s", (text) => {
    const r = parseExpiryDate(text, { today });
    expect(r.suggestedExpiryDate).toBeNull();
    expect(r.manufacturingDate).toBeNull();
  });
});
