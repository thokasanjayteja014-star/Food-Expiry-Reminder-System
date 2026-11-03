import type { Category } from "@/types/product";
import type { ScanResult } from "./ocr";
import { barcodeExpiry, barcodeManufacturing, type BarcodeData } from "./gs1";
import type { ProductInfo } from "./productLookup";

/** True when the barcode itself carried an expiry, best-before or sell-by date. */
export function barcodeHasDates(data: BarcodeData): boolean {
  return Boolean(barcodeExpiry(data));
}

/** Turns a barcode reading into the same shape the OCR flow produces, for the confirm step. */
export function scanResultFromBarcode(raw: string, data: BarcodeData, product: ProductInfo | null): ScanResult {
  const expiry = barcodeExpiry(data);
  const messages: string[] = [];
  if (!expiry) messages.push("This barcode has no dates in it. Please enter the expiry date from the package.");
  else if (!data.expiryDate && data.bestBeforeDate) messages.push("The barcode gives a best-before date. Please check it against the package.");
  else messages.push("Please check the dates against the package before saving.");
  return {
    text: `Barcode: ${raw.replace(/\u001d/g, " ")}`,
    ocrConfidence: 100,
    quality: "Good",
    productName: product?.name ?? "",
    category: (product?.category ?? "Other") as Category,
    barcode: { code: data.gtin ?? raw, datesFromBarcode: Boolean(expiry) },
    parse: {
      expiryDate: expiry,
      suggestedExpiryDate: null,
      alternatives: [],
      manufacturingDate: barcodeManufacturing(data),
      expirySource: expiry ? "printed" : null,
      precision: expiry ? "day" : null,
      relativeShelfLife: null,
      confidence: expiry ? "high" : "none",
      ambiguous: false,
      needsConfirmation: true,
      messages,
      candidates: [],
    },
  };
}

/** Fills in the product name and category from a barcode lookup after the dates were read by OCR. */
export function withBarcodeProduct(result: ScanResult, code: string, product: ProductInfo | null): ScanResult {
  return {
    ...result,
    productName: product?.name || result.productName,
    category: product && product.category !== "Other" ? product.category : result.category,
    barcode: { code, datesFromBarcode: false },
  };
}
