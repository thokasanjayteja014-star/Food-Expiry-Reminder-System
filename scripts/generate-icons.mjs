// Renders the PWA icons from SVG with the Playwright-bundled Chromium.
// Usage: npm run icons   (needs `npx playwright install chromium` once if no browser is available)
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const mark = (bg, rx, inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <rect width="64" height="64" rx="${rx}" fill="${bg}"/>
  <g transform="translate(${inset} ${inset}) scale(${(64 - 2 * inset) / 64})">
    <rect x="16" y="18" width="32" height="32" rx="6" fill="#fff"/>
    <rect x="16" y="18" width="32" height="9" rx="4" fill="#a6f4c5"/>
    <path d="M24 38l6 6 11-13" fill="none" stroke="#039855" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="23" y="12" width="5" height="10" rx="2.5" fill="#fff"/>
    <rect x="36" y="12" width="5" height="10" rx="2.5" fill="#fff"/>
  </g>
</svg>`;

// Monochrome badge for the Android status bar.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <rect x="12" y="14" width="40" height="40" rx="8" fill="#fff"/>
  <path d="M22 35l7 7 13-15" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICONS = [
  ["icon-192.png", 192, mark("#039855", 14, 0)],
  ["icon-512.png", 512, mark("#039855", 14, 0)],
  ["apple-touch-icon.png", 180, mark("#039855", 0, 0)],
  ["maskable-512.png", 512, mark("#039855", 0, 10)],
  ["badge-72.png", 72, badge],
];

await mkdir("public/icons", { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, size, svg] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
  console.log("wrote", name);
}
await browser.close();
