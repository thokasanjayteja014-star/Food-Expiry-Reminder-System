import { describe, expect, it } from "vitest";
import { validateEmail, validateImageFile, validatePassword, validateProduct } from "@/lib/validation";
import type { ProductInput } from "@/types/product";

const today = "2026-10-07";
const base: ProductInput = {
  productName: "Milk",
  category: "Dairy",
  manufacturingDate: null,
  expiryDate: "2026-10-20",
  expiryDateSource: "manual",
  quantity: 1,
  storageLocation: "",
  notes: "",
  imageUrl: null,
  source: "manual",
  reminderDays: 3,
};

describe("validateProduct", () => {
  it("accepts a valid product", () => {
    expect(validateProduct(base, today)).toEqual({ valid: true, errors: {}, warnings: [] });
  });
  it("requires a name and an expiry date", () => {
    const r = validateProduct({ ...base, productName: "  ", expiryDate: "" }, today);
    expect(r.errors.productName).toBe("Product name is required.");
    expect(r.errors.expiryDate).toBe("Expiry date is required.");
  });
  it("rejects impossible dates", () => {
    expect(validateProduct({ ...base, expiryDate: "2026-02-30" }, today).errors.expiryDate).toBeDefined();
    expect(validateProduct({ ...base, expiryDate: "2099-01-01" }, today).errors.expiryDate).toMatch(/too far/);
  });
  it("warns, but allows saving, when already expired", () => {
    const r = validateProduct({ ...base, expiryDate: "2026-10-01" }, today);
    expect(r.valid).toBe(true);
    expect(r.warnings).toContain("This product has already expired.");
  });
  it("checks the manufacturing date", () => {
    expect(validateProduct({ ...base, manufacturingDate: "2026-10-25" }, today).errors.manufacturingDate).toMatch(/future/);
    expect(validateProduct({ ...base, manufacturingDate: "2026-10-01", expiryDate: "2026-09-01" }, today).errors.expiryDate).toMatch(/after the manufacturing/);
  });
  it("checks quantity and reminder days", () => {
    expect(validateProduct({ ...base, quantity: -1 }, today).errors.quantity).toBeDefined();
    expect(validateProduct({ ...base, reminderDays: 0 }, today).errors.reminderDays).toBeDefined();
  });
});

describe("account validation", () => {
  it("validates passwords", () => {
    expect(validatePassword("short1").valid).toBe(false);
    expect(validatePassword("longpassword").valid).toBe(false);
    expect(validatePassword("food2026safe").valid).toBe(true);
  });
  it("validates emails", () => {
    expect(validateEmail("sanjay@example.com")).toBe(true);
    expect(validateEmail("not-an-email")).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("accepts JPG, PNG and WEBP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateImageFile({ type, size: 1000 })).toBeNull();
  });
  it("rejects other types and huge files", () => {
    expect(validateImageFile({ type: "application/pdf", size: 1000 })).toMatch(/JPG, PNG or WEBP/);
    expect(validateImageFile({ type: "image/gif", size: 1000 })).toMatch(/JPG, PNG or WEBP/);
    expect(validateImageFile({ type: "image/jpeg", size: 20 * 1024 * 1024 })).toMatch(/Image is too large/);
  });
});
