"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Camera, ImageUp, Loader2, RefreshCw } from "lucide-react";
import { detectBarcode, getBarcodeDetector, type DetectedBarcode } from "@/lib/barcode";
import { FRIENDLY } from "@/lib/errors";
import { validateImageFile } from "@/lib/validation";
import { Alert } from "./Alert";

type CameraState = "starting" | "live" | "denied" | "unavailable" | "insecure" | "busy" | "missing";

const BLOCKED_MESSAGE = {
  denied: FRIENDLY.camera,
  unavailable: FRIENDLY.cameraUnavailable,
  insecure: FRIENDLY.cameraInsecure,
  busy: FRIENDLY.cameraBusy,
  missing: FRIENDLY.cameraMissing,
} as const;

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}

/** A full-resolution photo from the camera, or null where the browser cannot take one. */
async function takeStill(stream: MediaStream | null): Promise<ImageBitmap | null> {
  const track = stream?.getVideoTracks()[0];
  const Capture = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  if (!track || !Capture) return null;
  try {
    const blob = await Promise.race([
      new Capture(track).takePhoto(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("takePhoto timed out")), 4000)),
    ]);
    return await createImageBitmap(blob);
  } catch (error) {
    console.warn("Full-resolution photo failed, using the preview frame", error);
    return null;
  }
}

/**
 * Live rear-camera preview with a scanning frame, plus the mandatory upload fallback.
 * Captures only the area inside the frame (with a margin), which is where the user
 * places the expiry date, so OCR has less clutter to read.
 */
export function ScanCamera({
  onImage,
  onBarcode,
}: {
  onImage: (blob: Blob, source: "camera" | "upload") => void;
  /** Called as soon as a barcode is seen in the live preview. Omit to turn barcode scanning off. */
  onBarcode?: (barcode: DetectedBarcode) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [barcodeReady, setBarcodeReady] = useState(false);
  const onBarcodeRef = useRef(onBarcode);
  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setState("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      // Camera APIs need HTTPS (or localhost) and a supporting browser.
      setState(window.isSecureContext ? "unavailable" : "insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // 1080p keeps the preview smooth; the photo itself is taken at full resolution (takeStill).
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setState("live");
    } catch (error) {
      const name = (error as DOMException)?.name;
      console.error("Camera failed to start", error);
      if (name === "NotAllowedError" || name === "SecurityError") setState("denied");
      else if (name === "NotReadableError" || name === "AbortError") setState("busy");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setState("missing");
      else setState("unavailable");
    }
  }, [stop]);

  useEffect(() => {
    // Starting the camera is an external side effect the component exists for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
    return stop;
  }, [start, stop]);

  // Watch the live preview for barcodes and hand the first one straight back.
  const scanBarcodes = Boolean(onBarcode);
  useEffect(() => {
    if (state !== "live" || !scanBarcodes) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const video = videoRef.current;
      if (cancelled || !video) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const found = await detectBarcode(video);
        if (cancelled) return;
        if (found) {
          navigator.vibrate?.(120);
          stop();
          onBarcodeRef.current?.(found);
          return;
        }
      }
      timer = setTimeout(tick, 250);
    };
    void getBarcodeDetector().then((d) => {
      if (cancelled) return;
      setBarcodeReady(Boolean(d));
      if (d) void tick();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, scanBarcodes, stop]);

  async function capture() {
    const video = videoRef.current;
    const container = containerRef.current;
    const frame = frameRef.current;
    if (!video || !container || !frame || !video.videoWidth) return;
    setCapturing(true);

    // Map the on-screen frame back to video pixels (the video is shown with object-fit: cover).
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const c = container.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const scale = Math.max(c.width / vw, c.height / vh);
    const ox = (c.width - vw * scale) / 2;
    const oy = (c.height - vh * scale) / 2;
    const margin = 0.08;
    let sx = (f.left - c.left - ox) / scale - (f.width / scale) * margin;
    let sy = (f.top - c.top - oy) / scale - (f.height / scale) * margin;
    let sw = (f.width / scale) * (1 + 2 * margin);
    let sh = (f.height / scale) * (1 + 2 * margin);
    sx = Math.max(0, sx);
    sy = Math.max(0, sy);
    sw = Math.min(vw - sx, sw);
    sh = Math.min(vh - sy, sh);

    // A full-resolution still (where the browser can take one) is far sharper than a video
    // frame: tiny dot-matrix print on cans is unreadable in the preview stream.
    const still = await takeStill(streamRef.current);
    let source: CanvasImageSource = video;
    if (still) {
      // The preview is the centre of the sensor image, scaled down.
      const k = Math.min(still.width / vw, still.height / vh);
      const offX = (still.width - vw * k) / 2;
      const offY = (still.height - vh * k) / 2;
      sx = sx * k + offX;
      sy = sy * k + offY;
      sw *= k;
      sh *= k;
      source = still;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext("2d")!.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    if (still && "close" in still) still.close();
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (blob) {
          stop();
          onImage(blob, "camera");
        }
      },
      "image/jpeg",
      0.95,
    );
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      setUploadError(err);
      return;
    }
    setUploadError(null);
    stop();
    onImage(file, "upload");
  }

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative mx-auto h-[min(52dvh,30rem)] w-full max-w-md overflow-hidden rounded-2xl bg-brand-900 shadow-[0_20px_40px_-20px_rgba(16,24,40,0.5)]"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className={`h-full w-full object-cover ${state === "live" ? "" : "invisible"}`}
        />
        {state === "live" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              ref={frameRef}
              className="relative h-[40%] w-[86%] rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            >
              {/* Corner brackets and a sweeping line show where to aim. */}
              {["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl", "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl", "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl"].map((c) => (
                <span key={c} className={`absolute size-7 border-white ${c}`} />
              ))}
              <span className="animate-sweep absolute inset-x-3 h-0.5 rounded bg-brand-200 shadow-[0_0_14px_2px_rgba(189,235,250,0.85)]" />
            </div>
            <p className="mt-4 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
              Place the expiry date inside the frame.
            </p>
            {barcodeReady && (
              <p className="mt-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                <Barcode aria-hidden className="size-4" /> Barcodes are read automatically
              </p>
            )}
          </div>
        )}
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 aria-hidden className="mr-2 size-5 animate-spin" /> Starting camera...
          </div>
        )}
        {state in BLOCKED_MESSAGE && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <Camera aria-hidden className="size-10 opacity-60" />
            <p className="text-sm">{BLOCKED_MESSAGE[state as keyof typeof BLOCKED_MESSAGE]}</p>
            {(state === "denied" || state === "busy") && (
              <button type="button" onClick={() => void start()} className="btn bg-white/15 text-white hover:bg-white/25">
                <RefreshCw aria-hidden className="size-4" /> Try camera again
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-sm muted">Make sure the expiry date is clearly visible, in good light and not blurry.</p>

      {state in BLOCKED_MESSAGE && <Alert tone="warning">{BLOCKED_MESSAGE[state as keyof typeof BLOCKED_MESSAGE]}</Alert>}
      {uploadError && <Alert tone="error">{uploadError}</Alert>}

      <div className="mx-auto grid max-w-md gap-2">
        <button type="button" onClick={capture} disabled={state !== "live" || capturing} className="btn-primary min-h-14 text-base">
          {capturing ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Camera aria-hidden className="size-5" />}
          Capture Image
        </button>
        <div className="flex items-center gap-3 text-xs uppercase tracking-wider muted">
          <span className="h-px flex-1 bg-[var(--border)]" /> or <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary min-h-12">
          <ImageUp aria-hidden className="size-5" /> Upload Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload an image of the food package"
          onChange={onFile}
        />
        <p className="text-center text-xs muted">JPG, PNG or WEBP, up to 10 MB.</p>
      </div>
    </div>
  );
}
