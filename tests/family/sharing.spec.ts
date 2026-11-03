import { expect, test, type Browser, type Page } from "@playwright/test";

/** Family sharing with two real accounts (Firebase emulators): invite, join, shared list, removal. */

function inDays(n: number) {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function person(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

async function register(page: Page, name: string, email: string) {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("secret-pass-123");
  await page.getByLabel("Confirm password").fill("secret-pass-123");
  await page.getByRole("button", { name: "Create account" }).click();
}

async function addProduct(page: Page, name: string, days: number) {
  await page.goto("/products/new");
  await page.getByLabel(/Product name/).fill(name);
  await page.getByLabel("Category").selectOption("Dairy");
  await page.getByLabel(/Expiry \/ best-before date/).fill(inDays(days));
  await page.getByRole("button", { name: "Save Product" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("two family members share one food list", async ({ browser }) => {
  const stamp = Date.now();

  // Amma signs up, adds milk, and creates the household.
  const amma = await person(browser);
  await amma.goto("/register");
  await register(amma, "Amma", `amma${stamp}@example.com`);
  await expect(amma).toHaveURL(/dashboard/, { timeout: 60_000 });
  await addProduct(amma, "Milk", 2);
  await amma.goto("/household");
  await amma.getByLabel("Household name").fill("Sharma Home");
  await amma.getByRole("button", { name: "Create household" }).click();
  await expect(amma.getByRole("heading", { name: "Sharma Home" })).toBeVisible({ timeout: 30_000 });
  const code = (await amma.getByTestId("invite-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  // Her milk moved into the shared list.
  await amma.goto("/inventory");
  await expect(amma.getByRole("heading", { name: "Milk" })).toBeVisible();

  // Ravi opens the invite link, has no account yet, signs up and joins.
  const ravi = await person(browser);
  await ravi.goto(`/join/${code}`);
  await expect(ravi).toHaveURL(/login\?next=/, { timeout: 60_000 });
  await ravi.getByRole("link", { name: "Create an account" }).click();
  await expect(ravi).toHaveURL(/register\?next=/);
  await register(ravi, "Ravi", `ravi${stamp}@example.com`);
  await expect(ravi).toHaveURL(new RegExp(`/join/${code}`), { timeout: 60_000 });
  await ravi.getByRole("button", { name: "Join Sharma Home" }).click();
  await expect(ravi).toHaveURL(/household/, { timeout: 30_000 });
  await expect(ravi.getByText("Members (2)")).toBeVisible({ timeout: 30_000 });

  // Ravi sees Amma's milk and adds bread; Amma sees the bread with his name, live.
  await ravi.goto("/inventory");
  await expect(ravi.getByRole("heading", { name: "Milk" })).toBeVisible({ timeout: 30_000 });
  await addProduct(ravi, "Bread", 4);
  await amma.goto("/inventory");
  await expect(amma.getByRole("heading", { name: "Bread" })).toBeVisible({ timeout: 30_000 });
  await expect(amma.getByText(/by Ravi/)).toBeVisible();

  // Amma removes Ravi: his list empties and the old code stops working.
  await amma.goto("/household");
  await amma.getByRole("button", { name: "Remove Ravi" }).click();
  await amma.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(amma.getByText("Members (1)")).toBeVisible({ timeout: 30_000 });
  await expect(amma.getByTestId("invite-code")).not.toHaveText(code);

  await ravi.goto("/inventory");
  await expect(ravi.getByRole("heading", { name: "Milk" })).toHaveCount(0, { timeout: 30_000 });
  await ravi.goto(`/join/${code}`);
  await expect(ravi.getByText(/not valid/)).toBeVisible({ timeout: 30_000 });
});
