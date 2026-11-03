"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, ScanText } from "lucide-react";
import { scanImage, STAGE_LABELS, type OcrStage, type ScanResult } from "@/lib/ocr";
import { compressImage } from "@/lib/imageProcessing";
import { FRIENDLY } from "@/lib/errors";
import { Alert } from "./Alert";

const ORDER: OcrStage[] = ["preparing", "reading", "detecting", "done"];

/** Image preview with "Process Image" / "Retake", then OCR with visible progress. */
export function OCRProcessor({
  image,
  onResult,
  onRetake,
}: {
  image: Blob;
  onResult: (result: ScanResult) => void;
  onRetake: () => void;
}) {
  const previewUrl = useMemo(() => URL.createObjectURL(image), [image]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  const [stage, setStage] = useState<OcrStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function process() {
    setError(null);
    setProgress(0);
    try {
      const compressed = await compressImage(image);
      const result = await scanImage(compressed, { onStage: setStage, onProgress: setProgress });
      onResult(result);
    } catch (e) {
      console.error("OCR failed", e);
      setStage(null);
      setError(navigator.onLine ? FRIENDLY.ocrFailed : "The text reader needs an internet connection the first time it runs. Please reconnect and try again.");
    }
  }

  const busy = stage !== null && stage !== "done";

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      <img src={previewUrl} alt="Captured food package" className="max-h-[50dvh] w-full rounded-2xl bg-stone-900 object-contain" />

      {stage && (
        <div className="card p-4" aria-live="polite">
          <ol className="space-y-2">
            {ORDER.map((s) => {
              const idx = ORDER.indexOf(s);
              const current = ORDER.indexOf(stage);
              const done = idx < current || stage === "done";
              const active = idx === current && stage !== "done";
              return (
                <li key={s} className={`flex items-center gap-2 text-sm ${done || active ? "" : "muted"}`}>
                  {done ? (
                    <Check aria-hidden className="size-4 text-brand-600" />
                  ) : active ? (
                    <Loader2 aria-hidden className="size-4 animate-spin text-brand-600" />
                  ) : (
                    <span aria-hidden className="size-4 rounded-full border border-[var(--border)]" />
                  )}
                  {STAGE_LABELS[s]}
                  {active && s === "reading" && progress > 0 && <span className="muted">{Math.round(progress * 100)}%</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary min-h-12" onClick={onRetake} disabled={busy}>
          <RotateCcw aria-hidden className="size-4" /> Retake
        </button>
        <button type="button" className="btn-primary min-h-12" onClick={process} disabled={busy}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ScanText aria-hidden className="size-4" />}
          {busy ? "Processing image..." : "Process Image"}
        </button>
      </div>
    </div>
  );
}
