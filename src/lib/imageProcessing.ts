/**
 * Light image preprocessing for OCR, done on the user's device with <canvas>:
 * resize -> grayscale -> contrast stretch -> sharpen. Deliberately simple.
 */

export interface CropRect {
  /** Fractions (0-1) of the source width/height. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Target size for the longer side. Big enough for small print, small enough for phones. */
const OCR_MAX_SIDE = 1800;
const OCR_MIN_WIDTH = 1000;

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The decoded image stays usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/** Draws (an optional crop of) the image scaled to a sensible OCR size. */
function drawScaled(img: HTMLImageElement, crop?: CropRect): HTMLCanvasElement {
  const sx = crop ? img.naturalWidth * crop.x : 0;
  const sy = crop ? img.naturalHeight * crop.y : 0;
  const sw = crop ? img.naturalWidth * crop.width : img.naturalWidth;
  const sh = crop ? img.naturalHeight * crop.height : img.naturalHeight;
  let scale = Math.min(1, OCR_MAX_SIDE / Math.max(sw, sh));
  if (sw * scale < OCR_MIN_WIDTH) scale = Math.min(3, OCR_MIN_WIDTH / sw); // upscale small crops
  const canvas = createCanvas(sw * scale, sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Grayscale and stretch contrast between the 2nd and 98th percentile of brightness. */
function grayscaleAndStretch(data: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    data[i] = y;
    hist[y]!++;
  }
  const total = data.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]!) < total * 0.02; ) lo++;
  for (let acc = 0; hi > 0 && (acc += hist[hi]!) < total * 0.02; ) hi--;
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((data[i]! - lo) * 255) / range));
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
}

/** 3x3 sharpen kernel on the (already grayscale) red channel. */
function sharpen(src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const v =
        5 * src[i]! - src[i - 4]! - src[i + 4]! - src[i - width * 4]! - src[i + width * 4]!;
      const c = Math.min(255, Math.max(0, v));
      out[i] = out[i + 1] = out[i + 2] = c;
    }
  }
  return out;
}

/** Returns a canvas ready for Tesseract. */
export async function preprocessForOcr(blob: Blob, crop?: CropRect): Promise<HTMLCanvasElement> {
  const img = await loadImage(blob);
  const canvas = drawScaled(img, crop);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayscaleAndStretch(imageData.data);
  imageData.data.set(sharpen(imageData.data, canvas.width, canvas.height));
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Small JPEG data URL (about 15-40 KB) for the optional product photo. */
export async function makeThumbnail(blob: Blob, maxSide = 360, quality = 0.6): Promise<string> {
  const img = await loadImage(blob);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = createCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Shrinks very large photos before OCR/preview to save memory on phones. */
export async function compressImage(blob: Blob, maxSide = 2400, quality = 0.9): Promise<Blob> {
  const img = await loadImage(blob);
  if (Math.max(img.naturalWidth, img.naturalHeight) <= maxSide && blob.size < 3 * 1024 * 1024) return blob;
  const scale = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
  const canvas = createCanvas(img.naturalWidth * Math.min(1, scale), img.naturalHeight * Math.min(1, scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Compression failed"))), "image/jpeg", quality),
  );
}
