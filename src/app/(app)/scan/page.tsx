"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Barcode, Camera, Loader2, PencilLine } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { warmUpOcr, type ScanResult } from "@/lib/ocr";
import { makeThumbnail } from "@/lib/imageProcessing";
import { getBarcodeDetector, type DetectedBarcode } from "@/lib/barcode";
import { parseBarcode } from "@/lib/gs1";
import { lookupProduct, type ProductInfo } from "@/lib/productLookup";
import { barcodeHasDates, scanResultFromBarcode, withBarcodeProduct } from "@/lib/barcodeResult";
import { PageHeader } from "@/components/PageHeader";
import { ScanCamera } from "@/components/ScanCamera";
import { OCRProcessor } from "@/components/OCRProcessor";
import { ScanConfirmation } from "@/components/ScanConfirmation";
import { Alert } from "@/components/Alert";

/** A barcode without dates: we know the product, the dates still have to come from the pack. */
interface KnownProduct {
  code: string;
  raw: string;
  product: ProductInfo | null;
}

type Step =
  | { kind: "capture"; known: KnownProduct | null }
  | { kind: "barcode"; barcode: DetectedBarcode }
  | { kind: "barcodeNoDates"; known: KnownProduct }
  | { kind: "preview"; image: Blob; known: KnownProduct | null }
  | { kind: "confirm"; result: ScanResult; thumbnail: string | null };

/** Scan flow: camera/upload -> preview -> OCR -> confirm -> save, or barcode -> (dates | OCR) -> confirm. */
export default function ScanPage() {
  const router = useRouter();
  const { repo } = useAuth();
  const { defaultReminderDays } = useProfile();
  const [step, setStep] = useState<Step>({ kind: "capture", known: null });

  useEffect(() => {
    warmUpOcr();
    void getBarcodeDetector();
  }, []);

  const description =
    step.kind === "confirm"
      ? "Check the details. Scanning can make mistakes, so you have the final say."
      : step.kind === "capture" && step.known
        ? "Now point your camera at the expiry date printed on the pack."
        : "Point your camera at the expiry date or the barcode, or upload a photo.";

  return (
    <>
      <PageHeader
        title="Scan food product"
        description={description}
        actions={
          <Link href="/products/new" className="btn-ghost">
            <PencilLine aria-hidden className="size-4" /> Enter manually
          </Link>
        }
      />

      {step.kind === "capture" && (
        <div className="space-y-3">
          {step.known && <KnownProductBanner known={step.known} />}
          <ScanCamera
            key={step.known ? "dates" : "any"}
            onImage={(image) => setStep({ kind: "preview", image, known: step.known })}
            // Once the product is known from its barcode, only the printed date is left to read.
            onBarcode={step.known ? undefined : (barcode) => setStep({ kind: "barcode", barcode })}
          />
        </div>
      )}

      {step.kind === "barcode" && (
        <BarcodeLookup
          barcode={step.barcode}
          onDone={setStep}
        />
      )}

      {step.kind === "barcodeNoDates" && (
        <div className="card mx-auto max-w-md space-y-4 p-5">
          <KnownProductBanner known={step.known} />
          <Alert tone="info">
            This barcode only identifies the product. Most food barcodes do not contain the manufacturing or expiry date, so the
            date has to be read from the print on the pack.
          </Alert>
          <div className="grid gap-2">
            <button type="button" className="btn-primary min-h-12" onClick={() => setStep({ kind: "capture", known: step.known })}>
              <Camera aria-hidden className="size-5" /> Scan the printed date
            </button>
            <button
              type="button"
              className="btn-secondary min-h-12"
              onClick={() =>
                setStep({
                  kind: "confirm",
                  result: scanResultFromBarcode(step.known.raw, parseBarcode(step.known.raw), step.known.product),
                  thumbnail: null,
                })
              }
            >
              <PencilLine aria-hidden className="size-5" /> Type the dates myself
            </button>
            <button type="button" className="btn-ghost" onClick={() => setStep({ kind: "capture", known: null })}>
              Scan a different product
            </button>
          </div>
        </div>
      )}

      {step.kind === "preview" && (
        <OCRProcessor
          image={step.image}
          onRetake={() => setStep({ kind: "capture", known: step.known })}
          onResult={async (ocr) => {
            const thumbnail = await makeThumbnail(step.image).catch(() => null);
            const result = step.known ? withBarcodeProduct(ocr, step.known.code, step.known.product) : ocr;
            setStep({ kind: "confirm", result, thumbnail });
          }}
        />
      )}

      {step.kind === "confirm" && (
        <div className="mx-auto max-w-2xl">
          <ScanConfirmation
            result={step.result}
            thumbnail={step.thumbnail}
            defaultReminderDays={defaultReminderDays}
            onScanAgain={() => setStep({ kind: "capture", known: null })}
            onSave={async (input) => {
              if (!repo) throw new Error("Not signed in");
              const id = await repo.addProduct(input);
              router.replace(`/products/${id}?saved=1`);
            }}
          />
        </div>
      )}
    </>
  );
}

/** Reads the barcode, looks up the product name, and decides where to go next. */
function BarcodeLookup({ barcode, onDone }: { barcode: DetectedBarcode; onDone: (step: Step) => void }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = parseBarcode(barcode.rawValue);
      const product = data.gtin ? await lookupProduct(data.gtin) : null;
      if (cancelled) return;
      if (barcodeHasDates(data)) {
        onDone({ kind: "confirm", result: scanResultFromBarcode(barcode.rawValue, data, product), thumbnail: null });
      } else {
        onDone({ kind: "barcodeNoDates", known: { code: data.gtin ?? barcode.rawValue, raw: barcode.rawValue, product } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [barcode, onDone]);

  return (
    <div className="card mx-auto flex max-w-md items-center gap-3 p-5" role="status">
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span>
        Barcode found <span className="font-mono text-sm muted">{barcode.rawValue.replace(/\u001d/g, " ")}</span>. Looking up the product...
      </span>
    </div>
  );
}

function KnownProductBanner({ known }: { known: KnownProduct }) {
  return (
    <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3 text-sm">
      <Barcode aria-hidden className="size-6 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{known.product?.name ?? "Product not in the online database"}</p>
        <p className="font-mono text-xs muted">Barcode {known.code}</p>
      </div>
    </div>
  );
}
