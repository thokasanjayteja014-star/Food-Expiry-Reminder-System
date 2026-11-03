/**
 * Reads pack photos. When the server has an AI reader (Gemini) set up and the phone is
 * online, the photo is sent there first; otherwise, or when it finds no expiry date,
 * on-device OCR with Tesseract.js (free and open source, no upload) reads it.
 * The worker, WebAssembly core and English data are served from our own /ocr folder
 * and cached by the browser and service worker, so repeat scans work offline.
 */
import type { Worker } from "tesseract.js";
import type { ExpiryParseResult } from "./dateParser";
import { guessCategory, guessProductName } from "./productHints";
import { loadImage, type CropRect } from "./imageProcessing";
import { fitForOcr, fromRGBA, toRGBA, type GrayImage } from "./ocrImage";
import { readWithPasses, type Recognize } from "./ocrPasses";
import { mergeVisionAnswer, type VisionAnswer } from "./visionMerge";
import { getIdToken } from "./auth";
import type { Category } from "@/types/product";

export type OcrStage = "preparing" | "reading" | "detecting" | "done";

export const STAGE_LABELS: Record<OcrStage, string> = {
  preparing: "Preparing image...",
  reading: "Reading package text...",
  detecting: "Detecting expiry date...",
  done: "Done.",
};

export type OcrQuality = "Good" | "Fair" | "Poor";

export interface ScanResult {
  text: string;
  /** Tesseract's mean word confidence, 0-100. */
  ocrConfidence: number;
  quality: OcrQuality;
  parse: ExpiryParseResult;
  productName: string;
  category: Category;
  /** "ai" when the AI reader found the dates, else the offline reader. */
  reader?: "ai" | "offline";
  /** Set when the details came from (or were completed by) a barcode. */
  barcode?: { code: string; datesFromBarcode: boolean };
}

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: number) => void) | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      // Assets are self-hosted from /ocr (see scripts/copy-ocr-assets.mjs).
      return createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: process.env.NEXT_PUBLIC_TESSERACT_LANG_PATH || "/ocr",
        workerBlobURL: false,
        logger: (m) => {
          if (m.status === "recognizing text") progressListener?.(m.progress);
        },
      });
    })().catch((e) => {
      workerPromise = null; // allow a retry, e.g. after the network comes back
      throw e;
    });
  }
  return workerPromise;
}

/** Starts downloading the OCR engine early so the first scan feels faster. */
export function warmUpOcr(): void {
  getWorker().catch(() => {});
}

/**
 * Grades the scan by what it found, not by Tesseract's word confidence (which is low for
 * dot-matrix print even when the dates are read correctly).
 * Good: expiry and manufacturing date found. Fair: expiry found. Poor: no expiry date.
 */
export function gradeQuality(parse: ExpiryParseResult): OcrQuality {
  if (parse.expiryDate && !parse.ambiguous && (parse.manufacturingDate || parse.confidence === "high")) return "Good";
  if (parse.expiryDate || parse.suggestedExpiryDate) return "Fair";
  return "Poor";
}

/** A plain-language line describing what the scan found, shown above the details. */
export function describeResult(result: Pick<ScanResult, "parse">): string {
  const { parse } = result;
  if (parse.expiryDate && parse.manufacturingDate) return "Expiry and manufacturing dates found";
  if (parse.expiryDate) return "Expiry date found";
  if (parse.suggestedExpiryDate) return "Possible expiry date found, please check";
  return "No date found, please type it or scan again";
}

/** Draws the photo (or a crop of it) as grayscale pixels, with the longer side at most 2400px. */
async function photoToGray(image: Blob, crop?: CropRect): Promise<GrayImage> {
  const img = await loadImage(image);
  const sx = crop ? img.naturalWidth * crop.x : 0;
  const sy = crop ? img.naturalHeight * crop.y : 0;
  const sw = crop ? img.naturalWidth * crop.width : img.naturalWidth;
  const sh = crop ? img.naturalHeight * crop.height : img.naturalHeight;
  const scale = Math.min(1, 2400 / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return fromRGBA(data, canvas.width, canvas.height);
}

function grayToCanvas(img: GrayImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(img)), img.width, img.height), 0, 0);
  return canvas;
}

/** Off once the server says AI reading is not set up, so later scans skip the request. */
let aiUnavailable = false;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Longest side sent to the AI reader; the models scale photos down to about this anyway. */
const AI_MAX_SIDE = 2048;

/** Shrinks a large photo before upload so it stays under the AI providers' size limits. */
async function shrinkForAi(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return image;
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, AI_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && image.size < 3_000_000) {
      bitmap.close();
      return image;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob ?? image;
  } catch {
    return image;
  }
}

/**
 * Reads the photo with the AI reader on the server (Groq, Grok or Gemini). Returns null when it is not
 * set up, the phone is offline, or it found no expiry, so the offline reader takes over.
 */
async function readWithAi(image: Blob): Promise<ScanResult | null> {
  if (aiUnavailable || (typeof navigator !== "undefined" && !navigator.onLine)) return null;
  const token = await getIdToken().catch(() => null);
  if (!token) return null;
  try {
    image = await shrinkForAi(image);
    const mimeType = ["image/jpeg", "image/png", "image/webp"].includes(image.type) ? image.type : "image/jpeg";
    const res = await fetch("/api/scan/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: await blobToBase64(image), mimeType }),
    });
    if (res.status === 503) aiUnavailable = true;
    if (!res.ok) return null;
    const answer = (await res.json()) as VisionAnswer;
    const parse = mergeVisionAnswer(answer);
    if (!parse.expiryDate) return null;
    const text = answer.printedText;
    return {
      text,
      ocrConfidence: 100,
      quality: gradeQuality(parse),
      parse,
      productName: answer.productName || guessProductName(text),
      category: guessCategory(`${answer.productName}\n${text}`),
      reader: "ai",
    };
  } catch (error) {
    console.warn("AI reading failed, using the offline reader", error);
    return null;
  }
}

/**
 * Full pipeline: find the printed text block, zoom in on it, read it several ways
 * (thresholded, dots joined for dot-matrix print, different sizes) and keep the dates
 * that the readings agree on. Falls back to the whole photo and rotated photos.
 */
export async function scanImage(
  image: Blob,
  options: { crop?: CropRect; onStage?: (s: OcrStage) => void; onProgress?: (p: number) => void } = {},
): Promise<ScanResult> {
  const { onStage, onProgress } = options;
  onStage?.("reading");
  const ai = options.crop ? null : await readWithAi(image);
  if (ai) {
    onProgress?.(1);
    onStage?.("done");
    return ai;
  }

  onStage?.("preparing");
  const photo = await photoToGray(image, options.crop);

  onStage?.("reading");
  const worker = await getWorker();
  try {
    const recognize: Recognize = async (img, psm) => {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm) as never });
      const { data } = await worker.recognize(grayToCanvas(img));
      return { text: data.text ?? "", confidence: data.confidence ?? 0 };
    };
    const { best } = await readWithPasses(photo, recognize, {
      onPass: (done, planned) => {
        onProgress?.(Math.min(0.95, done / Math.max(1, planned)));
        if (done > 0) onStage?.("detecting");
      },
    });
    const { text, parse } = best;
    // The date block rarely holds the product name, so read the whole photo once for it.
    let productName = guessProductName(text);
    let category = guessCategory(text);
    if (!productName) {
      const whole = await recognize(fitForOcr(photo), 3).catch(() => null);
      if (whole) {
        productName = guessProductName(whole.text);
        if (category === "Other") category = guessCategory(whole.text);
      }
    }
    onProgress?.(1);
    onStage?.("done");
    return {
      text,
      ocrConfidence: Math.round(best.confidence),
      quality: gradeQuality(parse),
      parse,
      productName,
      category,
      reader: "offline",
    };
  } finally {
    progressListener = null;
  }
}
