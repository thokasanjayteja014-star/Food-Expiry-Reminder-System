import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function enterDemo(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: /try the demo/i }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Total products")).toBeVisible();
}

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/dashboard");
  await page.waitForURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("landing page explains the product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Food Expiry Reminder/, level: 1 })).toBeVisible();
  await expect(page.getByText("No additional hardware required.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
});

test("dashboard shows calculated counts from demo data", async ({ page }) => {
  await enterDemo(page);
  // Demo dates are relative to today: 8 active, 4 expiring (incl. today), 1 expired, 3 safe.
  for (const name of ["8 Total products", "4 Expiring soon", "1 Expired", "3 Safe"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

test("manual add validates, saves, consumes and deletes", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/products/new");
  await page.getByRole("button", { name: "Save Product" }).click();
  await expect(page.getByText("Product name is required.")).toBeVisible();
  await expect(page.getByText("Expiry date is required.")).toBeVisible();

  await page.getByLabel(/Product name/).fill("Paneer Test");
  await page.getByLabel("Category").selectOption("Dairy");
  const d = new Date(Date.now() + 3 * 86_400_000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.getByLabel(/Expiry \/ best-before date/).fill(iso);
  await page.getByRole("button", { name: "Save Product" }).click();

  await expect(page.getByRole("heading", { name: "Paneer Test" })).toBeVisible();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await expect(page.getByText("3 days remaining")).toBeVisible();
  await expect(page.locator("article").getByText("Expiring soon", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mark as Consumed" }).click();
  await expect(page.getByText("Paneer Test marked as consumed.")).toBeVisible();
  await expect(page.locator("article").getByText("Consumed", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Are you sure you want to delete Paneer Test?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("**/inventory");
  await expect(page.getByText("Paneer Test")).toHaveCount(0);
});

test("inventory search, filter and sort", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/inventory");
  await page.getByRole("searchbox").fill("milk");
  await expect(page.getByText("1 product", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Expired", exact: true }).click();
  await expect(page.getByText("1 product", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paneer" })).toBeVisible();
  await page.getByRole("button", { name: "Consumed", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Butter" })).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Sort by").selectOption("alpha");
  await expect(page.locator("ul h3").first()).toHaveText("Biscuits");
});

test("scan: upload image, real OCR, confirm and save", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/scan");
  await page.locator("input[type=file]").setInputFiles(path.join(__dirname, "../fixtures/milk-label.png"));
  await page.getByRole("button", { name: "Process Image" }).click();
  await expect(page.getByRole("heading", { name: "Detected information" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("20 Oct 2026")).toBeVisible();
  await expect(page.getByText("1 Oct 2026")).toBeVisible();
  await expect(page.getByText("Expiry and manufacturing dates found")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & Save" }).click();
  await expect(page.getByRole("heading", { name: "Milk" })).toBeVisible();
  await expect(page.getByText("20 October 2026")).toBeVisible();
  await expect(page.getByText("Added by scanning")).toBeVisible();
});

test("scan: camera preview and capture work with a camera", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/scan");
  await expect(page.getByText("Place the expiry date inside the frame.")).toBeVisible();
  await page.getByRole("button", { name: "Capture Image" }).click();
  await expect(page.getByRole("img", { name: "Captured food package" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
});

test("pages fit narrow phones without horizontal scrolling", async ({ page }) => {
  await enterDemo(page);
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ["/dashboard", "/inventory", "/scan", "/products/new", "/notifications", "/settings", "/products/demo-milk"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test("PWA manifest and service worker are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.json")).json();
  expect(manifest.name).toBe("Food Expiry Reminder");
  expect(manifest.short_name).toBe("Food Expiry");
  expect(manifest.display).toBe("standalone");
  const sw = await request.get("/service-worker.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("notificationclick");
});

test("notifications: in-app reminders, mark as read, permission states", async ({ page }) => {
  await enterDemo(page);
  // The in-app reminder check runs on load and records due reminders.
  await page.goto("/notifications");
  await expect(page.getByText("Milk expires in 2 days.", { exact: false })).toBeVisible();
  await expect(page.getByText("Bread expires tomorrow. Please consume it soon.")).toBeVisible();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("You're all caught up.")).toBeVisible();

  // Headless Chromium always reports notification permission as denied, which exercises the denied state.
  await page.goto("/settings");
  await expect(page.getByText("Permission:")).toContainText(/Denied|Not requested|Granted/);
  const denied = (await page.getByText("Permission:").textContent())?.includes("Denied");
  if (denied) {
    await expect(page.getByText("Notifications are disabled. You can enable them from your browser settings.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Test Notification" })).toBeDisabled();
  }
});
