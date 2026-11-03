"use client";

import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Save } from "lucide-react";
import {
  CATEGORIES,
  REMINDER_OPTIONS,
  type Category,
  type ExpiryDateSource,
  type ProductInput,
  type ProductSource,
} from "@/types/product";
import { validateProduct } from "@/lib/validation";
import { friendlyMessage, FRIENDLY } from "@/lib/errors";
import { Alert } from "./Alert";

export interface ProductFormValues {
  productName: string;
  category: Category;
  manufacturingDate: string;
  expiryDate: string;
  expiryDateSource: ExpiryDateSource;
  quantity: string;
  storageLocation: string;
  notes: string;
  reminderDays: number;
}

export function emptyFormValues(reminderDays: number): ProductFormValues {
  return {
    productName: "",
    category: "Other",
    manufacturingDate: "",
    expiryDate: "",
    expiryDateSource: "manual",
    quantity: "1",
    storageLocation: "",
    notes: "",
    reminderDays,
  };
}

const STORAGE_SUGGESTIONS = ["Refrigerator", "Freezer", "Kitchen shelf", "Cupboard", "Pantry", "Hostel room"];

/**
 * Shared form for manual entry, editing, and confirming OCR results.
 * Validates before calling `onSubmit`; never reports success unless `onSubmit` resolves.
 */
export function ProductForm({
  initial,
  source,
  imageUrl = null,
  submitLabel = "Save Product",
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
  beforeFields,
  expiryHint,
  extraActions,
}: {
  initial: ProductFormValues;
  source: ProductSource;
  imageUrl?: string | null;
  submitLabel?: string;
  onSubmit: (input: ProductInput) => Promise<void>;
  onCancel: () => void;
  cancelLabel?: string;
  beforeFields?: ReactNode;
  /** Shown under the expiry date field (e.g. "Calculated from manufacturing date"). */
  expiryHint?: ReactNode;
  extraActions?: ReactNode;
}) {
  const id = useId();
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customReminder, setCustomReminder] = useState(
    !(REMINDER_OPTIONS as readonly number[]).includes(initial.reminderDays),
  );

  const input: ProductInput = useMemo(
    () => ({
      productName: values.productName,
      category: values.category,
      manufacturingDate: values.manufacturingDate || null,
      expiryDate: values.expiryDate,
      expiryDateSource: values.expiryDateSource,
      quantity: values.quantity.trim() === "" ? null : Number(values.quantity),
      storageLocation: values.storageLocation,
      notes: values.notes,
      imageUrl,
      source,
      reminderDays: values.reminderDays,
    }),
    [values, imageUrl, source],
  );

  const validation = useMemo(() => validateProduct(input), [input]);
  const errors = touched ? validation.errors : {};

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      // A date the user typed themselves is no longer "printed" or "calculated".
      if (key === "expiryDate" && value !== initial.expiryDate) next.expiryDateSource = "manual";
      if (key === "expiryDate" && value === initial.expiryDate) next.expiryDateSource = initial.expiryDateSource;
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setSubmitError(null);
    if (!validation.valid) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setSaving(true);
    try {
      await onSubmit(input);
    } catch (error) {
      console.error("Save failed", error);
      setSubmitError(friendlyMessage(error, FRIENDLY.save));
      setSaving(false);
    }
  }

  const field = (name: keyof ProductFormValues) => ({
    id: `${id}-${name}`,
    "aria-invalid": errors[name as keyof typeof errors] ? true : undefined,
    "aria-describedby": errors[name as keyof typeof errors] ? `${id}-${name}-error` : undefined,
  });

  const errorText = (name: keyof typeof validation.errors) =>
    errors[name] ? (
      <p id={`${id}-${name}-error`} className="field-error">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {beforeFields}

      <div>
        <label htmlFor={`${id}-productName`} className="label">
          Product name <span aria-hidden className="text-red-600">*</span>
        </label>
        <input
          {...field("productName")}
          className="input"
          value={values.productName}
          onChange={(e) => set("productName", e.target.value)}
          placeholder="e.g. Milk"
          autoComplete="off"
          required
          maxLength={80}
        />
        {errorText("productName")}
      </div>

      <div>
        <label htmlFor={`${id}-category`} className="label">
          Category
        </label>
        <select {...field("category")} className="input" value={values.category} onChange={(e) => set("category", e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {errorText("category")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-manufacturingDate`} className="label">
            Manufacturing date <span className="font-normal muted">(optional)</span>
          </label>
          <input
            {...field("manufacturingDate")}
            type="date"
            className="input"
            value={values.manufacturingDate}
            onChange={(e) => set("manufacturingDate", e.target.value)}
          />
          {errorText("manufacturingDate")}
        </div>
        <div>
          <label htmlFor={`${id}-expiryDate`} className="label">
            Expiry / best-before date <span aria-hidden className="text-red-600">*</span>
          </label>
          <input
            {...field("expiryDate")}
            type="date"
            className="input"
            value={values.expiryDate}
            onChange={(e) => set("expiryDate", e.target.value)}
            required
          />
          {errorText("expiryDate")}
          {expiryHint && values.expiryDate === initial.expiryDate && <div className="mt-1 text-sm">{expiryHint}</div>}
        </div>
      </div>

      {validation.warnings.length > 0 && values.expiryDate && (
        <Alert tone="warning">{validation.warnings.join(" ")} You can still save it to keep a record.</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-quantity`} className="label">
            Quantity <span className="font-normal muted">(optional)</span>
          </label>
          <input
            {...field("quantity")}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className="input"
            value={values.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
          {errorText("quantity")}
        </div>
        <div>
          <label htmlFor={`${id}-storageLocation`} className="label">
            Storage location <span className="font-normal muted">(optional)</span>
          </label>
          <input
            {...field("storageLocation")}
            className="input"
            list={`${id}-locations`}
            value={values.storageLocation}
            onChange={(e) => set("storageLocation", e.target.value)}
            placeholder="e.g. Refrigerator"
            maxLength={60}
          />
          <datalist id={`${id}-locations`}>
            {STORAGE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {errorText("storageLocation")}
        </div>
      </div>

      <fieldset>
        <legend className="label">Remind me</legend>
        <div className="flex flex-wrap gap-2">
          {REMINDER_OPTIONS.map((d) => (
            <label
              key={d}
              className={`btn cursor-pointer border ${
                !customReminder && values.reminderDays === d
                  ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                  : "border-[var(--border)] bg-[var(--surface)]"
              } has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-500`}
            >
              <input
                type="radio"
                name={`${id}-reminder`}
                className="sr-only"
                checked={!customReminder && values.reminderDays === d}
                onChange={() => {
                  setCustomReminder(false);
                  set("reminderDays", d);
                }}
              />
              {d} day{d > 1 ? "s" : ""} before
            </label>
          ))}
          <label
            className={`btn cursor-pointer border ${
              customReminder ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : "border-[var(--border)] bg-[var(--surface)]"
            } has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-500`}
          >
            <input type="radio" name={`${id}-reminder`} className="sr-only" checked={customReminder} onChange={() => setCustomReminder(true)} />
            Custom
          </label>
        </div>
        {customReminder && (
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`${id}-reminderDays`} className="text-sm">
              Days before expiry
            </label>
            <input
              {...field("reminderDays")}
              type="number"
              min={1}
              max={30}
              className="input w-24"
              value={values.reminderDays}
              onChange={(e) => set("reminderDays", Math.round(Number(e.target.value)))}
            />
          </div>
        )}
        {errorText("reminderDays")}
      </fieldset>

      <div>
        <label htmlFor={`${id}-notes`} className="label">
          Notes <span className="font-normal muted">(optional)</span>
        </label>
        <textarea
          {...field("notes")}
          className="input min-h-20"
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={500}
          rows={3}
        />
        {errorText("notes")}
      </div>

      {submitError && <Alert tone="error">{submitError}</Alert>}
      {touched && !validation.valid && <Alert tone="error">Please fix the highlighted fields.</Alert>}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {extraActions}
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
          {saving ? "Saving product..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
