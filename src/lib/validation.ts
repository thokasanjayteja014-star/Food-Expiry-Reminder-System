/** Input validation shared by forms. Returns friendly messages, never technical ones. */
import { CATEGORIES, type Category, type ProductInput } from "@/types/product";
import { diffInDays, isValidISODate, todayISO } from "./dates";

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export interface ProductValidationResult {
  valid: boolean;
  errors: FieldErrors<keyof ProductInput & string>;
  /** Non-blocking warnings, e.g. the product has already expired. */
  warnings: string[];
}

/** Food dates more than this far ahead are treated as typos. */
export const MAX_YEARS_AHEAD = 15;

export function validateProduct(input: Partial<ProductInput>, today: string = todayISO()): ProductValidationResult {
  const errors: ProductValidationResult["errors"] = {};
  const warnings: string[] = [];

  const name = (input.productName ?? "").trim();
  if (!name) errors.productName = "Product name is required.";
  else if (name.length > 80) errors.productName = "Product name must be 80 characters or fewer.";

  if (!input.category || !CATEGORIES.includes(input.category as Category)) {
    errors.category = "Please choose a category.";
  }

  const expiry = input.expiryDate ?? "";
  if (!expiry) {
    errors.expiryDate = "Expiry date is required.";
  } else if (!isValidISODate(expiry)) {
    errors.expiryDate = "Please enter a valid expiry date.";
  } else {
    const days = diffInDays(today, expiry);
    if (days > MAX_YEARS_AHEAD * 366) errors.expiryDate = "This expiry date is too far in the future. Please check it.";
    else if (days < -5 * 366) errors.expiryDate = "This expiry date is too far in the past. Please check it.";
    else if (days < 0) warnings.push("This product has already expired.");
  }

  const mfg = input.manufacturingDate;
  if (mfg) {
    if (!isValidISODate(mfg)) errors.manufacturingDate = "Please enter a valid manufacturing date.";
    else if (diffInDays(today, mfg) > 1) errors.manufacturingDate = "Manufacturing date cannot be in the future.";
    else if (expiry && isValidISODate(expiry) && mfg > expiry) {
      errors.expiryDate = "Expiry date must be after the manufacturing date.";
    }
  }

  if (input.quantity !== null && input.quantity !== undefined) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 9999) {
      errors.quantity = "Quantity must be a positive number.";
    }
  }

  if (input.reminderDays !== undefined) {
    if (!Number.isInteger(input.reminderDays) || input.reminderDays < 1 || input.reminderDays > 30) {
      errors.reminderDays = "Reminder must be between 1 and 30 days.";
    }
  }

  if ((input.storageLocation ?? "").length > 60) errors.storageLocation = "Storage location is too long.";
  if ((input.notes ?? "").length > 500) errors.notes = "Notes must be 500 characters or fewer.";

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

export interface PasswordCheck {
  valid: boolean;
  message: string | null;
}

/** At least 8 characters with a letter and a number. */
export function validatePassword(password: string): PasswordCheck {
  if (password.length < 8) return { valid: false, message: "Password must be at least 8 characters." };
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { valid: false, message: "Password must include at least one letter and one number." };
  }
  if (password.length > 128) return { valid: false, message: "Password is too long." };
  return { valid: true, message: null };
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// --- Images -----------------------------------------------------------------

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateImageFile(file: { type: string; size: number; name?: string }): string | null {
  const ext = (file.name ?? "").toLowerCase().split(".").pop() ?? "";
  const typeOk = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase());
  const extOk = ["jpg", "jpeg", "png", "webp"].includes(ext);
  if (!typeOk && !(file.type === "" && extOk)) return "Please choose a JPG, PNG or WEBP image.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large. Please choose an image under 10 MB.";
  if (file.size === 0) return "This image is empty. Please choose another one.";
  return null;
}
