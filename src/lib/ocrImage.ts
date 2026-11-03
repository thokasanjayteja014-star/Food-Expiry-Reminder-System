/**
 * Pure grayscale image operations used to prepare photos for OCR. They run the same
 * in the browser (from a canvas) and in Node (for tests), so what we test is what ships.
 */
export interface GrayImage {
  /** One byte per pixel, 0 = black, 255 = white. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CropFraction {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fromRGBA(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  for (let p = 0, i = 0; p < data.length; p++, i += 4) {
    data[p] = (299 * rgba[i]! + 587 * rgba[i + 1]! + 114 * rgba[i + 2]!) / 1000;
  }
  return { data, width, height };
}

export function toRGBA(img: GrayImage): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let p = 0, i = 0; p < img.data.length; p++, i += 4) {
    const v = img.data[p]!;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

export function crop(img: GrayImage, f: CropFraction): GrayImage {
  const x0 = Math.max(0, Math.round(img.width * f.x));
  const y0 = Math.max(0, Math.round(img.height * f.y));
  const w = Math.max(1, Math.min(img.width - x0, Math.round(img.width * f.width)));
  const h = Math.max(1, Math.min(img.height - y0, Math.round(img.height * f.height)));
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) data.set(img.data.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + w), y * w);
  return { data, width: w, height: h };
}

/** Centre crop keeping `fraction` of each side. */
export function centre(img: GrayImage, fraction: number): GrayImage {
  const m = (1 - fraction) / 2;
  return crop(img, { x: m, y: m, width: fraction, height: fraction });
}

/** Bilinear resize. */
export function resize(img: GrayImage, width: number, height: number): GrayImage {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  if (width === img.width && height === img.height) return img;
  const data = new Uint8ClampedArray(width * height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.min(img.height - 1, Math.floor(fy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.min(img.width - 1, Math.floor(fx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const a = img.data[y0 * img.width + x0]!;
      const b = img.data[y0 * img.width + x1]!;
      const c = img.data[y1 * img.width + x0]!;
      const d = img.data[y1 * img.width + x1]!;
      data[y * width + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
    }
  }
  return { data, width, height };
}

/** Scales so the longer side is at most `maxSide` and the width at least `minWidth` (capped at 3x). */
export function fitForOcr(img: GrayImage, maxSide = 1800, minWidth = 1000): GrayImage {
  let scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (img.width * scale < minWidth) scale = Math.min(3, minWidth / img.width);
  return resize(img, img.width * scale, img.height * scale);
}

export function rotate(img: GrayImage, degrees: 90 | 180 | 270): GrayImage {
  const { width: w, height: h } = img;
  const out = new Uint8ClampedArray(w * h);
  const [nw, nh] = degrees === 180 ? [w, h] : [h, w];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = img.data[y * w + x]!;
      let nx: number;
      let ny: number;
      if (degrees === 90) [nx, ny] = [h - 1 - y, x];
      else if (degrees === 180) [nx, ny] = [w - 1 - x, h - 1 - y];
      else [nx, ny] = [y, w - 1 - x];
      out[ny * nw + nx] = v;
    }
  }
  return { data: out, width: nw, height: nh };
}

/** Stretches contrast between the 2nd and 98th percentile of brightness. */
export function stretch(img: GrayImage): GrayImage {
  const hist = new Uint32Array(256);
  for (const v of img.data) hist[v]!++;
  const total = img.data.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]!) < total * 0.02; ) lo++;
  for (let acc = 0; hi > 0 && (acc += hist[hi]!) < total * 0.02; ) hi--;
  const range = Math.max(1, hi - lo);
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < data.length; i++) data[i] = ((img.data[i]! - lo) * 255) / range;
  return { ...img, data };
}

/** 3x3 sharpen. */
export function sharpen(img: GrayImage): GrayImage {
  const { width: w, height: h, data: src } = img;
  const data = new Uint8ClampedArray(src);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      data[i] = 5 * src[i]! - src[i - 1]! - src[i + 1]! - src[i - w]! - src[i + w]!;
    }
  }
  return { ...img, data };
}

/** Box blur with radius r (two separable passes). Joins the dots of dot-matrix print. */
export function blur(img: GrayImage, r: number): GrayImage {
  r = Math.max(1, Math.round(r));
  const { width: w, height: h } = img;
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += img.data[y * w + Math.min(w - 1, Math.max(0, k))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / n;
      sum += img.data[y * w + Math.min(w - 1, x + r + 1)]! - img.data[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Sauvola local thresholding: black text on white, robust to shadows and uneven light
 * (curved bottles, glare). `window` is the neighbourhood size in pixels.
 */
export function binarize(img: GrayImage, window = 41, k = 0.2): GrayImage {
  const { width: w, height: h, data: src } = img;
  // Integral images of values and squared values.
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x]!;
      rs += v;
      rq += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1]! + rs;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1]! + rq;
    }
  }
  const half = Math.max(1, Math.floor(window / 2));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const area = (x1 - x0) * (y1 - y0);
      const s = sum[y1 * W + x1]! - sum[y0 * W + x1]! - sum[y1 * W + x0]! + sum[y0 * W + x0]!;
      const q = sq[y1 * W + x1]! - sq[y0 * W + x1]! - sq[y1 * W + x0]! + sq[y0 * W + x0]!;
      const mean = s / area;
      const sd = Math.sqrt(Math.max(0, q / area - mean * mean));
      const t = mean * (1 + k * (sd / 128 - 1));
      out[y * w + x] = src[y * w + x]! > t ? 255 : 0;
    }
  }
  return { data: out, width: w, height: h };
}

/** True when the picture is mostly dark, i.e. light text on a dark background. */
export function isMostlyDark(img: GrayImage): boolean {
  let total = 0;
  for (let i = 0; i < img.data.length; i += 7) total += img.data[i]!;
  return total / Math.ceil(img.data.length / 7) < 110;
}

export function invert(img: GrayImage): GrayImage {
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 255 - img.data[i]!;
  return { ...img, data };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Blob extends Box {
  pixels: number;
}

/**
 * Finds character-sized black blobs in a black-on-white binary image, skipping what
 * confuses OCR on product photos: the rim of a lid, fingers, shadows, big logos, speckle.
 */
export function findTextBlobs(bin: GrayImage): Blob[] {
  const { width: w, height: h, data } = bin;
  const minDim = Math.min(w, h);
  const maxCharH = minDim * 0.12;
  const maxCharW = minDim * 0.25;
  const minPixels = Math.max(4, Math.round((minDim / 1000) ** 2 * 6));
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const blobs: Blob[] = [];
  for (let start = 0; start < w * h; start++) {
    if (data[start]! !== 0 || seen[start]) continue;
    let top = 0;
    let pixels = 0;
    stack[top++] = start;
    seen[start] = 1;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (top > 0) {
      const p = stack[--top]!;
      pixels++;
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const push = (q: number) => {
        if (data[q]! === 0 && !seen[q]) {
          seen[q] = 1;
          stack[top++] = q;
        }
      };
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const touchesEdge = minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1;
    const fill = pixels / (bw * bh);
    if (pixels < minPixels || bh > maxCharH || bw > maxCharW || bh < 4 || fill <= 0.08) continue;
    if (touchesEdge && (bw > maxCharW / 2 || bh > maxCharH / 2)) continue;
    blobs.push({ x: minX, y: minY, width: bw, height: bh, pixels });
  }
  return blobs;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export interface TextRegion extends Box {
  /** Number of character-like blobs in the region. */
  blobs: number;
  /** Typical character height in pixels. */
  charHeight: number;
}

/**
 * Groups character blobs into text blocks, most text-like first. Two blobs join when they
 * have a similar height and sit side by side on a row (letters of a word) or one line
 * apart (lines of a block). A block of printed dates ("MFG ... / EXP ...") becomes one
 * region. Random texture (keyboards, fabric, food) rarely forms neat rows on a smooth
 * background, so regions are ranked by how many blobs sit in rows and how plain the
 * background between them is. Pass the grayscale image for the background check.
 */
export function findTextRegions(bin: GrayImage, maxRegions = 3, gray?: GrayImage): TextRegion[] {
  return scoreTextRegions(bin, gray)
    .slice(0, maxRegions)
    .map(({ score: _score, ...r }) => r);
}

/** Like findTextRegions, with each region's score, best first. */
export function scoreTextRegions(bin: GrayImage, gray?: GrayImage): Array<TextRegion & { score: number }> {
  const blobs = findTextBlobs(bin).filter((b) => b.height >= 6);
  if (blobs.length < 4) return [];
  const parent = blobs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const inRow = new Uint8Array(blobs.length);

  // Spatial buckets so each blob is only compared with its neighbours.
  const bucket = 64;
  const buckets = new Map<string, number[]>();
  blobs.forEach((b, i) => {
    const key = `${Math.floor(b.x / bucket)},${Math.floor(b.y / bucket)}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(i);
  });
  blobs.forEach((a, i) => {
    const reach = Math.ceil((a.height * 2) / bucket) + 1;
    const bx = Math.floor(a.x / bucket);
    const by = Math.floor(a.y / bucket);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (const j of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          if (j <= i) continue;
          const b = blobs[j]!;
          const h = Math.max(a.height, b.height);
          if (h / Math.min(a.height, b.height) > 1.8) continue;
          const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
          const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
          const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const sameRow = overlapY > 0.5 * Math.min(a.height, b.height) && gapX < 1.2 * h;
          const nextLine = gapY < 0.9 * h && (overlapX > -1.5 * h);
          if (sameRow) {
            inRow[i] = inRow[j] = 1;
            union(i, j);
          } else if (nextLine) {
            union(i, j);
          }
        }
      }
    }
  });

  const groups = new Map<number, number[]>();
  blobs.forEach((_, i) => {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(i);
  });

  const regions: Array<TextRegion & { score: number }> = [];
  for (const members of groups.values()) {
    const rowBlobs = members.filter((i) => inRow[i]).length;
    if (rowBlobs < 4) continue;
    const bs = members.map((i) => blobs[i]!);
    const x0 = Math.min(...bs.map((b) => b.x));
    const y0 = Math.min(...bs.map((b) => b.y));
    const x1 = Math.max(...bs.map((b) => b.x + b.width));
    const y1 = Math.max(...bs.map((b) => b.y + b.height));
    const charHeight = median(bs.map((b) => b.height));
    if (x1 - x0 < charHeight * 3) continue;
    // Plain background: low brightness variation among the non-text pixels of the block.
    let bgPenalty = 1;
    if (gray) {
      let n = 0, sum = 0, sq = 0;
      const step = Math.max(1, Math.floor(((x1 - x0) * (y1 - y0)) / 4000));
      for (let p = 0, y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++, p++) {
          if (p % step || bin.data[y * bin.width + x] === 0) continue;
          const v = gray.data[y * gray.width + x]!;
          n++;
          sum += v;
          sq += v * v;
        }
      }
      const sd = n ? Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) : 0;
      bgPenalty = 1 + sd / 15;
    }
    // Dates are a short block of 1-4 lines; long paragraphs (ingredients) rank lower.
    const lines = (y1 - y0) / (charHeight * 1.6);
    const score = Math.min(rowBlobs, 60) / Math.max(1, lines / 5) / bgPenalty;
    regions.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, blobs: rowBlobs, charHeight, score });
  }
  return regions.sort((a, b) => b.score - a.score);
}

/** Crops a pixel box with a margin, clamped to the image. */
export function cropBox(img: GrayImage, box: Box, margin: number): GrayImage {
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  const x1 = Math.min(img.width, box.x + box.width + margin);
  const y1 = Math.min(img.height, box.y + box.height + margin);
  return crop(img, { x: x / img.width, y: y / img.height, width: (x1 - x) / img.width, height: (y1 - y) / img.height });
}

/** Global Otsu threshold. */
export function otsu(img: GrayImage): GrayImage {
  const hist = new Array<number>(256).fill(0);
  for (const v of img.data) hist[v]!++;
  const n = img.data.length;
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]!;
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += i * hist[i]!;
    const between = wB * wF * (sumB / wB - (total - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  const data = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) data[i] = img.data[i]! > threshold ? 255 : 0;
  return { ...img, data };
}

/**
 * Evens out uneven light (glare on metal cans, shadows on curved bottles) by dividing
 * each pixel by a heavily blurred copy of the picture, so the background becomes flat white.
 */
export function flattenLight(img: GrayImage, radius: number): GrayImage {
  const bg = blur(blur(img, radius), radius);
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < data.length; i++) data[i] = Math.min(255, (img.data[i]! * 235) / Math.max(1, bg.data[i]!));
  return { ...img, data };
}

/** Rotates by any angle around the centre (bilinear), filling with white. */
export function rotateBy(img: GrayImage, degrees: number): GrayImage {
  if (Math.abs(degrees) < 0.25) return img;
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const { width: w, height: h, data: d } = img;
  const cx = w / 2;
  const cy = h / 2;
  const out = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = c * (x - cx) + s * (y - cy) + cx;
      const sy = -s * (x - cx) + c * (y - cy) + cy;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * w + x0;
      out[y * w + x] =
        d[i]! * (1 - fx) * (1 - fy) + d[i + 1]! * fx * (1 - fy) + d[i + w]! * (1 - fx) * fy + d[i + w + 1]! * fx * fy;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Angle (degrees) of the text lines in a black-on-white image, from -15 to 15. Picks the
 * shear whose row profile has the sharpest edges, i.e. where the lines are level.
 */
export function estimateSkew(bin: GrayImage, maxDegrees = 15, step = 0.5): number {
  const { width: w, height: h, data } = bin;
  const points: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 2) if (data[y * w + x]! < 128) points.push(x - w / 2, y);
  if (points.length < 20) return 0;
  let best = 0;
  let bestScore = -1;
  const profile = new Float64Array(h * 2);
  for (let deg = -maxDegrees; deg <= maxDegrees; deg += step) {
    const t = Math.tan((deg * Math.PI) / 180);
    profile.fill(0);
    for (let i = 0; i < points.length; i += 2) {
      const yy = Math.round(points[i + 1]! - points[i]! * t + h / 2);
      if (yy >= 0 && yy < profile.length) profile[yy]!++;
    }
    let score = 0;
    for (let i = 1; i < profile.length; i++) score += (profile[i]! - profile[i - 1]!) ** 2;
    // Prefer level text on ties so straight labels are left alone.
    if (score > bestScore * (1 + 1e-6) || (score >= bestScore && Math.abs(deg) < Math.abs(best))) {
      bestScore = Math.max(score, bestScore);
      best = deg;
    }
  }
  return best;
}

function minFilter(img: GrayImage, r: number): GrayImage {
  const { width: w, height: h, data } = img;
  const tmp = new Uint8ClampedArray(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.min(m, data[y * w + k]!);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.min(m, tmp[k * w + x]!);
      out[y * w + x] = m;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Joins the separate dots of dot-matrix print into solid strokes: grows black by `grow`
 * pixels, then shrinks it back by `shrink`, so gaps between dots close but letters keep their shape.
 */
export function joinDots(bin: GrayImage, grow: number, shrink: number): GrayImage {
  const grown = minFilter(bin, Math.max(1, Math.round(grow)));
  if (shrink < 1) return grown;
  return invert(minFilter(invert(grown), Math.round(shrink)));
}

/** Rows [start, end) of the text lines in a black-on-white image, from its row profile. */
export function splitLines(bin: GrayImage, minHeight: number): Array<[number, number]> {
  const { width: w, height: h, data } = bin;
  const profile = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]! < 128) profile[y]!++;
  const threshold = Math.max(...profile) * 0.12;
  const lines: Array<[number, number]> = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && profile[y]! > threshold;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start >= minHeight) lines.push([start, y]);
      start = -1;
    }
  }
  return lines;
}

/** Rows y0..y1 of an image. */
export function rows(img: GrayImage, y0: number, y1: number): GrayImage {
  y0 = Math.max(0, Math.round(y0));
  y1 = Math.min(img.height, Math.round(y1));
  return { width: img.width, height: Math.max(1, y1 - y0), data: img.data.slice(y0 * img.width, Math.max(y0 + 1, y1) * img.width) };
}

/** Turns black areas touching the image edge white: the dark pack or table around a label. */
export function clearBorder(bin: GrayImage): GrayImage {
  const { width: w, height: h } = bin;
  const data = new Uint8ClampedArray(bin.data);
  const stack: number[] = [];
  const push = (i: number) => {
    if (data[i]! < 128) {
      data[i] = 255;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < (h - 1) * w) push(i + w);
  }
  return { data, width: w, height: h };
}

/**
 * Typical gap (px) between the dots of dot-matrix print: the median short white run
 * between black runs along rows. 0 for solid print.
 */
export function dotGap(bin: GrayImage, maxGap: number): number {
  const { width: w, height: h, data } = bin;
  const gaps: number[] = [];
  let strokes = 0;
  for (let y = 0; y < h; y += 2) {
    let run = -1;
    for (let x = 0; x < w; x++) {
      const black = data[y * w + x]! < 128;
      if (black) {
        if (run > 0 && run <= maxGap) gaps.push(run);
        if (run !== 0) strokes++;
        run = 0;
      } else if (run >= 0) run++;
    }
  }
  if (gaps.length < 30 || gaps.length < strokes * 0.3) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1]!;
}
