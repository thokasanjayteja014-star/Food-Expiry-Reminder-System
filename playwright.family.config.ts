import { defineConfig, devices } from "@playwright/test";

// Two-person family sharing test against the local Firebase emulators (Auth + Firestore).
// Run with `npm run test:family` (needs Java); it starts the emulators and a dev server.
const env = {
  NEXT_PUBLIC_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-food-expiry",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
  NEXT_PUBLIC_ENABLE_DEMO: "true",
  FIREBASE_ADMIN_PROJECT_ID: "demo-food-expiry",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
};

export default defineConfig({
  testDir: "tests/family",
  timeout: 180_000,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Pixel 5"],
    defaultBrowserType: "chromium",
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env,
  },
});
