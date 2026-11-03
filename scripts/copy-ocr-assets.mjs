// Copies the Tesseract.js worker, WebAssembly core and English language data into
// public/ocr so OCR is served from our own site (no third-party CDN, cacheable offline).
// Runs automatically after `npm install`.
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const out = path.resolve("public/ocr");
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));

const files = [
  [path.join(pkgDir("tesseract.js"), "dist/worker.min.js"), "worker.min.js"],
  // LSTM-only cores; the worker picks the variant the browser supports.
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((f) => [
    path.join(pkgDir("tesseract.js-core"), f),
    f,
  ]),
  [path.join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int/eng.traineddata.gz"), "eng.traineddata.gz"],
];

await mkdir(out, { recursive: true });
let bytes = 0;
for (const [from, to] of files) {
  await copyFile(from, path.join(out, to));
  bytes += (await stat(from)).size;
}
console.log(`OCR assets copied to public/ocr (${(bytes / 1e6).toFixed(1)} MB)`);

// Barcode reader (ZXing compiled to WebAssembly), used where the browser has no built-in
// BarcodeDetector (for example Chrome on Windows).
const barcodeOut = path.resolve("public/barcode");
await mkdir(barcodeOut, { recursive: true });
await copyFile(require.resolve("zxing-wasm/reader/zxing_reader.wasm"), path.join(barcodeOut, "zxing_reader.wasm"));
console.log("Barcode reader copied to public/barcode");
