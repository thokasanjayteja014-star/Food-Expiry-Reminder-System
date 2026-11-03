/**
 * Light heuristics that suggest a product name and category from OCR text.
 * They are only suggestions shown on the confirmation screen.
 */
import type { Category } from "@/types/product";

// Checked in order: specific product types first, so "cream biscuits" is Snacks, not Dairy.
const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["Frozen", /\b(FROZEN|ICE CREAM|FREEZE|STORE BELOW -18|PEAS FROZEN|NUGGETS)\b/],
  ["Sauces", /\b(SAUCE|KETCHUP|MAYONNAISE|MAYO|CHUTNEY|DRESSING|PASTE|PICKLE|JAM|SPREAD)\b/],
  ["Snacks", /\b(BISCUITS?|COOKIES?|CHIPS|CRISPS|NAMKEEN|SNACKS?|WAFERS?|CRACKERS?|NOODLES|BHUJIA)\b/],
  ["Bakery", /\b(BREAD|BUN|PAV|CAKE|MUFFIN|CROISSANT|RUSK|BAGUETTE|BAKERY|LOAF)\b/],
  ["Beverages", /\b(JUICE|DRINK|BEVERAGE|SODA|COLA|WATER|TEA|COFFEE|SMOOTHIE|SHAKE)\b/],
  ["Canned", /\b(CANNED|TIN(NED)?|CAN)\b/],
  ["Dairy", /\b(MILK|CURD|YOG(H)?URT|DAHI|CHEESE|PANEER|BUTTER|CREAM|GHEE|LASSI|BUTTERMILK|CHHACH)\b/],
  ["Fruits", /\b(APPLE|BANANA|MANGO|ORANGE|GRAPES|BERRIES|FRUIT)\b/],
  ["Vegetables", /\b(TOMATO|POTATO|ONION|SPINACH|VEGETABLES?|CARROT|PEAS)\b/],
];

const NOISE =
  /\b(INGREDIENTS?|NUTRITION(AL)?|ENERGY|KCAL|PROTEIN|FAT|CARBOHYDRATE|SUGAR|SODIUM|NET\s*(WT|QTY|QUANTITY|CONTENT)|MRP|RS|INCL|TAXES|BATCH|LOT|FSSAI|LIC|STORE|KEEP|REFRIGERAT|PRICE|DATE|MFG|MFD|EXP|EXPIRY|BEST|BEFORE|USE BY|PKD|PACKED|MARKETED|MANUFACTURED|CUSTOMER|CARE|EMAIL|WWW|HTTP|ADDRESS|PVT|LTD|ALLERGEN|CONTAINS|VEG|BARCODE|SERVING|PER)\b/;

const QUANTITY = /\b\d+(?:[.,]\d+)?\s*(?:ML|L|LTR|LITRES?|G|GM|GMS|GRAMS?|KG|PCS|N)\b/gi;

/** Picks the most name-like line: short, mostly letters, near the top, not boilerplate. */
export function guessProductName(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let best = "";
  let bestScore = 0;
  lines.slice(0, 12).forEach((rawLine, i) => {
    // Drop pack sizes such as "500 ml" or "1 kg" so "Toned Milk 500 ml" becomes "Toned Milk".
    const line = rawLine.replace(QUANTITY, " ").replace(/\s+/g, " ").trim();
    const upper = line.toUpperCase();
    if (NOISE.test(upper)) return;
    const letters = (line.match(/[A-Za-z]/g) ?? []).length;
    if (letters < 3 || line.length > 32) return;
    const ratio = letters / line.replace(/\s/g, "").length;
    if (ratio < 0.75) return;
    const score = ratio * 10 + Math.min(letters, 14) - i * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  });
  return toTitleCase(best.replace(/[^A-Za-z0-9 &'\-]/g, " ").replace(/\s+/g, " ").trim());
}

export function guessCategory(text: string): Category {
  const upper = ` ${text.toUpperCase()} `;
  for (const [category, re] of CATEGORY_KEYWORDS) if (re.test(upper)) return category;
  return "Other";
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
