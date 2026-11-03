"use client";

import { useState } from "react";
import { CalendarCheck, Check, Pencil, RotateCcw } from "lucide-react";
import { describeResult, type ScanResult } from "@/lib/ocr";
import type { ProductInput } from "@/types/product";
import { formatDate, formatDateLong } from "@/lib/dates";
import { MESSAGES } from "@/lib/dateParser";
import { validateProduct } from "@/lib/validation";
import { friendlyMessage, FRIENDLY } from "@/lib/errors";
import { ProductForm, type ProductFormValues } from "./ProductForm";
import { Alert } from "./Alert";

const QUALITY_STYLE = {
  Good: "bg-safe-bg text-safe-fg",
  Fair: "bg-soon-bg text-soon-fg",
  Poor: "bg-today-bg text-today-fg",
} as const;

/**
 * "Detected Information": the OCR result is shown for the user to confirm, edit, or rescan.
 * Nothing is saved until the user presses "Confirm & Save".
 */
export function ScanConfirmation({
  result,
  thumbnail,
  defaultReminderDays,
  onSave,
  onScanAgain,
}: {
  result: ScanResult;
  thumbnail: string | null;
  defaultReminderDays: number;
  onSave: (input: ProductInput) => Promise<void>;
  onScanAgain: () => void;
}) {
  const { parse } = result;
  // Ambiguous dates: the user must pick the reading; we never silently guess.
  const readings = parse.expiryDate ? [parse.expiryDate, ...parse.alternatives.filter((d) => d !== parse.expiryDate)] : [];
  const [chosenExpiry, setChosenExpiry] = useState<string>(parse.ambiguous ? "" : (parse.expiryDate ?? ""));
  const [editing, setEditing] = useState(!parse.expiryDate);
  const [savePhoto, setSavePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial: ProductFormValues = {
    productName: result.productName,
    category: result.category,
    manufacturingDate: parse.manufacturingDate ?? "",
    expiryDate: chosenExpiry,
    expiryDateSource: parse.expirySource === "calculated" ? "calculated" : chosenExpiry ? "printed" : "manual",
    quantity: "1",
    storageLocation: "",
    notes: result.barcode ? `Barcode ${result.barcode.code}` : "",
    reminderDays: defaultReminderDays,
  };

  const toInput = (v: ProductFormValues): ProductInput => ({
    productName: v.productName,
    category: v.category,
    manufacturingDate: v.manufacturingDate || null,
    expiryDate: v.expiryDate,
    expiryDateSource: v.expiryDateSource,
    quantity: v.quantity ? Number(v.quantity) : null,
    storageLocation: v.storageLocation,
    notes: v.notes,
    imageUrl: savePhoto ? thumbnail : null,
    source: "ocr",
    reminderDays: v.reminderDays,
  });

  const quickInput = toInput(initial);
  const quickValidation = validateProduct(quickInput);
  const canQuickSave = quickValidation.valid && Boolean(chosenExpiry);

  async function quickSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(quickInput);
    } catch (e) {
      setError(friendlyMessage(e, FRIENDLY.save));
      setSaving(false);
    }
  }

  const calculatedHint =
    parse.expirySource === "calculated" ? (
      <span className="font-medium text-amber-700 dark:text-amber-300">{MESSAGES.calculated}</span>
    ) : null;

  const header = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Detected information</h2>
        {result.barcode?.datesFromBarcode ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${QUALITY_STYLE.Good}`}>Read from barcode</span>
        ) : (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${QUALITY_STYLE[result.quality]}`}>
            {describeResult(result)}
          </span>
        )}
      </div>
      {parse.messages.map((m) => (
        <Alert key={m} tone={parse.expiryDate ? "warning" : "error"}>
          {m}
        </Alert>
      ))}
      {!parse.expiryDate && parse.suggestedExpiryDate && (
        <div className="rounded-xl bg-[var(--surface-2)] p-3 text-sm">
          A possible date was found: <strong>{formatDate(parse.suggestedExpiryDate)}</strong>. Check the package before using it.
          <button
            type="button"
            className="btn-secondary mt-2 w-full sm:w-auto"
            onClick={() => {
              setChosenExpiry(parse.suggestedExpiryDate!);
              setEditing(true);
            }}
          >
            Use {formatDate(parse.suggestedExpiryDate)}
          </button>
        </div>
      )}
      {parse.ambiguous && readings.length > 1 && (
        <fieldset className="rounded-xl border border-amber-300 p-3 dark:border-amber-800">
          <legend className="px-1 text-sm font-semibold">Please confirm the expiry date</legend>
          <div className="mt-1 grid gap-2">
            {readings.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-[var(--surface-2)]">
                <input type="radio" name="expiry-reading" checked={chosenExpiry === d} onChange={() => setChosenExpiry(d)} className="size-4 accent-brand-600" />
                {formatDateLong(d)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );

  if (editing) {
    return (
      <div className="card space-y-4 p-5">
        {header}
        <ProductForm
          key={chosenExpiry}
          initial={initial}
          source="ocr"
          imageUrl={savePhoto ? thumbnail : null}
          submitLabel="Confirm & Save"
          onSubmit={onSave}
          onCancel={onScanAgain}
          cancelLabel="Scan Again"
          expiryHint={calculatedHint}
          beforeFields={<PhotoToggle thumbnail={thumbnail} checked={savePhoto} onChange={setSavePhoto} />}
        />
        <RawText text={result.text} confidence={result.ocrConfidence} />
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-5">
      {header}
      <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        <Row label="Product name" value={initial.productName || "Not detected, please add it"} missing={!initial.productName} />
        <Row label="Manufacturing date" value={initial.manufacturingDate ? formatDate(initial.manufacturingDate) : "Not found on the photo (optional)"} />
        <Row
          label="Expiry date"
          value={chosenExpiry ? formatDate(chosenExpiry) : "Choose a reading above"}
          missing={!chosenExpiry}
          hint={calculatedHint}
        />
        <Row label="Category" value={initial.category} />
      </dl>
      <PhotoToggle thumbnail={thumbnail} checked={savePhoto} onChange={setSavePhoto} />
      {!quickValidation.valid && chosenExpiry && (
        <Alert tone="info">Some details need attention. Choose Edit to complete them.</Alert>
      )}
      {quickValidation.warnings.length > 0 && <Alert tone="warning">{quickValidation.warnings.join(" ")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" className="btn-primary min-h-12" onClick={quickSave} disabled={!canQuickSave || saving}>
          {saving ? "Saving product..." : <><Check aria-hidden className="size-4" /> Confirm &amp; Save</>}
        </button>
        <button type="button" className="btn-secondary min-h-12" onClick={() => setEditing(true)} disabled={saving}>
          <Pencil aria-hidden className="size-4" /> Edit
        </button>
        <button type="button" className="btn-ghost min-h-12" onClick={onScanAgain} disabled={saving}>
          <RotateCcw aria-hidden className="size-4" /> Scan Again
        </button>
      </div>
      <RawText text={result.text} confidence={result.ocrConfidence} />
    </div>
  );
}

function Row({ label, value, missing, hint }: { label: string; value: string; missing?: boolean; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm muted">{label}</dt>
      <dd className={`text-right font-medium ${missing ? "text-amber-700 dark:text-amber-300" : ""}`}>
        {value}
        {hint && <span className="block text-xs">{hint}</span>}
      </dd>
    </div>
  );
}

function PhotoToggle({ thumbnail, checked, onChange }: { thumbnail: string | null; checked: boolean; onChange: (v: boolean) => void }) {
  if (!thumbnail) return null;
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-brand-600" />
      {/* eslint-disable-next-line @next/next/no-img-element -- small data URL */}
      <img src={thumbnail} alt="" className="size-12 rounded-lg object-cover" />
      <span>
        Save a small photo with this product <span className="muted">(optional, about 30 KB)</span>
      </span>
    </label>
  );
}

function RawText({ text, confidence }: { text: string; confidence: number }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium muted">
        <CalendarCheck aria-hidden className="mr-1 inline size-4" />
        Show text read from the package
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-2)] p-3 text-xs">
        {text.trim() || "(no text found)"}
      </pre>
      <p className="mt-1 text-xs muted">Text recognition confidence: {confidence}/100</p>
    </details>
  );
}
