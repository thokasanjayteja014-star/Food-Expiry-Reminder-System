import type { Category } from "@/types/product";

export interface ProductInfo {
  name: string;
  category: Category;
}

const CATEGORY_HINTS: Array<[RegExp, Category]> = [
  [/dair|milk|yogurt|yoghurt|curd|cheese|butter|paneer|cream|ghee/, "Dairy"],
  [/bread|baker|cake|bun|pastr/, "Bakery"],
  [/frozen|ice-cream/, "Frozen"],
  [/canned|tinned/, "Canned"],
  [/sauce|ketchup|condiment|pickle|spread|jam/, "Sauces"],
  [/beverage|drink|juice|water|soda|tea|coffee/, "Beverages"],
  [/snack|biscuit|cookie|chip|crisp|namkeen|chocolate|confection|noodle/, "Snacks"],
  [/fruit/, "Fruits"],
  [/vegetable/, "Vegetables"],
];

export function categoryFromTags(tags: string[]): Category {
  const joined = tags.join(" ").toLowerCase();
  for (const [re, category] of CATEGORY_HINTS) if (re.test(joined)) return category;
  return "Other";
}

/**
 * Looks up a product's name from its barcode number in Open Food Facts, a free public
 * product database. Only the barcode number is sent. Returns null when the product is
 * unknown, the device is offline, or the lookup takes too long.
 */
export async function lookupProduct(gtin: string, fetchImpl: typeof fetch = fetch): Promise<ProductInfo | null> {
  if (!/^\d{8,14}$/.test(gtin)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetchImpl(
      `https://world.openfoodfacts.org/api/v2/product/${gtin}.json?fields=product_name,product_name_en,brands,categories_tags`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; product_name_en?: string; brands?: string; categories_tags?: string[] };
    };
    const p = body.product;
    if (body.status !== 1 || !p) return null;
    const base = (p.product_name_en || p.product_name || "").trim();
    const brand = ((p.brands || "").split(",")[0] ?? "").trim();
    const name = (brand && base && !base.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${base}` : base || brand).slice(0, 80);
    if (!name) return null;
    return { name, category: categoryFromTags(p.categories_tags ?? []) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
