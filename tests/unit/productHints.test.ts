import { describe, expect, it } from "vitest";
import { guessCategory, guessProductName } from "@/lib/productHints";

describe("guessProductName", () => {
  it("picks a name-like line and drops the pack size", () => {
    expect(guessProductName("MILK\nToned Milk 500 ml\nMFG: 01/10/2026\nEXP: 20/10/2026")).toMatch(/Milk/);
    expect(guessProductName("Toned Milk 500 ml\nMRP Rs 30")).toBe("Toned Milk");
  });
  it("ignores boilerplate lines", () => {
    expect(guessProductName("INGREDIENTS: WHEAT FLOUR\nNET WT 200 G\nBrown Bread")).toBe("Brown Bread");
  });
  it("returns empty when nothing looks like a name", () => {
    expect(guessProductName("20/10/2026\n12345")).toBe("");
  });
});

describe("guessCategory", () => {
  it.each([
    ["FRESH CURD 400G", "Dairy"],
    ["WHOLE WHEAT BREAD", "Bakery"],
    ["TOMATO KETCHUP", "Sauces"],
    ["CREAM BISCUITS", "Snacks"],
    ["MANGO JUICE", "Beverages"],
    ["SOMETHING ELSE", "Other"],
  ])("%s -> %s", (text, cat) => {
    expect(guessCategory(text)).toBe(cat);
  });
});
