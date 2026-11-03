/**
 * Live barcode detection. Uses the browser's built-in BarcodeDetector where it exists
 * (Chrome on Android, macOS) and otherwise a WebAssembly build of ZXing served from
 * /barcode on our own site (copied by scripts/copy-ocr-assets.mjs).
 */
export interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; format: string }>>;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "data_matrix", "qr_code"];

let detectorPromise: Promise<Detector | null> | null = null;

async function createDetector(): Promise<Detector | null> {
  type NativeCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
  const Native = (globalThis as unknown as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.includes("ean_13") && formats.includes("data_matrix")) return new Native({ formats });
    } catch {
      // fall through to the WebAssembly detector
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/barcode/${path}` : prefix + path),
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
}

export function getBarcodeDetector(): Promise<Detector | null> {
  detectorPromise ??= createDetector().catch((e) => {
    console.warn("Barcode scanning unavailable", e);
    detectorPromise = null;
    return null;
  });
  return detectorPromise;
}

/** Looks for a barcode in the current video frame. Returns null if none is found. */
export async function detectBarcode(source: CanvasImageSource): Promise<DetectedBarcode | null> {
  const detector = await getBarcodeDetector();
  if (!detector) return null;
  try {
    const found = await detector.detect(source);
    const best = found.find((b) => b.rawValue) ?? null;
    return best ? { rawValue: best.rawValue, format: best.format } : null;
  } catch {
    return null;
  }
}
