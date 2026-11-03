# Food Expiry Reminder

**Track your food. Get reminded before it expires. Reduce food waste.**

A mobile-first web app (PWA) that reads the expiry date from a food package with your phone camera, lets you confirm it, tracks every product, and sends a push notification before it expires. It runs in any modern browser on a phone or laptop. No native app, no extra hardware.

---

## Contents

1. [Problem statement](#problem-statement)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Technology stack](#technology-stack)
5. [Folder structure](#folder-structure)
6. [Installation](#installation)
7. [Environment variables](#environment-variables)
8. [Firebase setup](#firebase-setup)
9. [OCR setup](#ocr-setup)
10. [Notification setup (VAPID Web Push)](#notification-setup-vapid-web-push)
11. [Reminder scheduling](#reminder-scheduling)
12. [Running locally](#running-locally)
13. [Demo mode](#demo-mode)
14. [Testing](#testing)
15. [Building for production](#building-for-production)
16. [Deployment (Vercel + Firebase)](#deployment-vercel--firebase)
17. [PWA installation](#pwa-installation)
18. [Mobile camera requirements](#mobile-camera-requirements)
19. [Notification permissions](#notification-permissions)
20. [API reference](#api-reference)
21. [Security](#security)
22. [Frugal innovation and budget](#frugal-innovation-and-budget)
23. [Limitations](#limitations)

---

## Problem statement

People buy milk, bread, curd, cheese, sauces, snacks, canned and frozen food on different days, and each item expires on a different day. The date is usually checked only when the food is about to be eaten, so items pushed to the back of the fridge or cupboard are forgotten and thrown away. This is common in homes, hostels and shared rooms.

This project solves it with what people already own: a smartphone and a browser. Scan the pack, confirm the date, and get reminded in time.

## Features

| Area | What it does |
| --- | --- |
| Accounts | Register (name, email, password), login, logout, Google sign-in, password reset, persistent sessions. All user pages are protected. |
| Scan | Live rear camera (`facingMode: "environment"`) with a scanning frame, capture, retake, or upload from gallery (JPG/PNG/WEBP, max 10 MB). Clear fallback message if the camera is unavailable or denied. |
| OCR | On-device Tesseract.js with light preprocessing (resize, grayscale, contrast stretch, sharpen). Progress shown as *Preparing image... / Reading package text... / Detecting expiry date... / Done.* |
| Date extraction | Finds dates near `EXP`, `EXPIRY`, `EXP DATE`, `EXPIRES`, `BEST BEFORE`, `BBE`, `USE BY` and ignores `MFG`/`PKD` dates. Supports `DD/MM/YYYY`, `DD-MM-YY`, `DD.MM.YYYY`, `20 OCT 2026`, `OCT 20 2026`, `OCT 2026`, `MM/YYYY`, ISO, and "Best before 6 months from MFG" (marked *Calculated from manufacturing date*). |
| Confirmation | Nothing is saved automatically. A *Detected information* screen shows product name, MFG date, expiry date, category and OCR confidence, with **Confirm & Save**, **Edit** and **Scan Again**. Ambiguous dates such as `05/06/2026` must be chosen by the user. Low-confidence results ask for manual entry. |
| Manual entry | Name, category, MFG date, expiry date, quantity, storage location, notes and reminder period, with validation and a warning for already-expired items. |
| Inventory | Search (name, category, location), status filter (All, Safe, Expiring soon, Expiring today, Expired, Consumed, Discarded), category filter, sort (nearest expiry, latest expiry, recently added, alphabetical). |
| Dashboard | Greeting with the user's name, Total / Expiring soon / Expired / Safe cards, Expiring soon, Recently added and All products lists, and a food tracking summary (consumed before expiry vs expired). |
| Product details | Every field, days remaining, status, optional photo, and Edit, Delete (with confirmation), Mark as Consumed, Mark as Discarded, Track again. |
| Status | Calculated every time it is shown: **SAFE** (> 7 days), **EXPIRING SOON** (1-7 days), **EXPIRING TODAY** (0), **EXPIRED** (< 0). Colour, icon and text together. |
| Reminders | Default 3 days before expiry; 1/3/5/7 days or custom per product. At most one "expiring soon", one "expiring today" and one "expired" reminder per product, never repeated. |
| Push notifications | Standard Web Push (Push API + Notification API + service worker + VAPID). Permission is asked only when the user taps **Enable Notifications**. **Send Test Notification** button. Clicking a notification opens the product. |
| Notification centre | Unread and read lists, mark as read, mark all as read, "Check reminders now", and honest delivery status (push sent / shown on this device / in-app only / failed). |
| PWA | Manifest, icons, installable, offline page, cached static assets and OCR engine, offline banner. |
| Settings | Profile name, notifications, default reminder period, light/dark/system theme, demo reset, privacy notice, delete all data, logout. |
| Demo mode | Sample data stored only in the browser, clearly labelled, never mixed with real accounts. |

## Architecture

```
 PHONE CAMERA / UPLOAD
        │
        ▼
 Image preprocessing (canvas)            ┐
        │                                │  all in the browser:
        ▼                                │  no image upload,
 Tesseract.js OCR (self-hosted /ocr)     │  no server cost
        │                                │
        ▼                                │
 Date extraction (src/lib/dateParser.ts) ┘
        │
        ▼
 USER CONFIRMATION (Confirm & Save / Edit / Scan Again)
        │
        ▼
 Firestore  users/{uid}/products/{id}   ◄── security rules: owner only
        │
        ├──► Dashboard / Inventory: calculateExpiryStatus() on every render
        │
        ▼
 Reminder engine (src/lib/reminders.ts: shouldSendReminder)
        │                         │
        ▼                         ▼
 Scheduled job (server)      In-app check (browser, when app is open)
 /api/reminders/check        same engine, same reminder ids
        │                         │
        ▼                         ▼
 users/{uid}/notifications/{productId_TYPE_expiryDate}  ◄── create-once = no duplicates
        │
        ▼
 web-push (VAPID) ──► browser push service ──► service worker ──► phone notification
                                                                    │ click
                                                                    ▼
                                                           /products/{id}
```

**Why this split:** OCR runs on the phone (free, private, works on a static host). Product CRUD goes directly from the browser to Firestore, protected by security rules, so it needs no server and works offline for reading. Only the parts that need secrets (sending push, the scheduled job) run in Next.js API routes.

**Firestore data model**

```
users/{userId}                       name, email, defaultReminderDays, timeZone, notificationsEnabled, createdAt
users/{userId}/products/{productId}  productName, category, manufacturingDate, expiryDate, expiryDateSource,
                                     quantity, storageLocation, notes, imageUrl, source, reminderDays,
                                     status (ACTIVE | CONSUMED | DISCARDED), consumedAt, discardedAt,
                                     createdAt, updatedAt
users/{userId}/notifications/{id}    title, message, productId, type, scheduledFor, sentAt, pushStatus,
                                     read, createdAt
users/{userId}/pushSubscriptions/{id}  subscription, userAgent, createdAt   (server only)
```

Dates are stored as `YYYY-MM-DD` strings because an expiry date is a calendar day, not a moment in time. `status` stores only what the user did (active, consumed, discarded). The time-based status (safe, expiring, expired) is never stored; it is calculated whenever products are displayed or processed.

## Technology stack

| Layer | Choice | Cost |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Lucide icons | Free, open source |
| Backend | Next.js API routes (Node.js runtime), Firebase Admin SDK | Free |
| Database | Firebase Firestore (Spark free plan) | ₹0 |
| Auth | Firebase Authentication (email/password, Google) | ₹0 |
| OCR | Tesseract.js 7, self-hosted WebAssembly and English data | Free, open source |
| Date parsing | Custom regex/label engine (`src/lib/dateParser.ts`) | — |
| Push | Web Push with VAPID (`web-push` library) | ₹0, no third-party account |
| PWA | Hand-written `manifest.json` and `service-worker.js` | — |
| Tests | Vitest, Firebase emulator + `@firebase/rules-unit-testing`, Playwright | Free |
| Hosting | Vercel Hobby (or any Node host) | ₹0 |

No charting library is used: the one statistic bar is plain CSS, which keeps the bundle small.

## Folder structure

```
src/
  app/
    page.tsx                    Landing page
    login/  register/  privacy/
    (app)/                      Protected pages (AuthGuard + AppShell)
      dashboard/  scan/  inventory/  expiring/  notifications/  settings/
      products/new/             Add manually
      products/[id]/            Product details
      products/[id]/edit/       Edit product
    api/
      notifications/subscribe/  POST, DELETE
      notifications/test/       POST
      reminders/check/          GET (cron), POST
      health/                   GET
  components/                   AppShell, Sidebar, BottomNavigation, ProductCard, ExpiryCard, StatusBadge,
                                ScanCamera, OCRProcessor, ScanConfirmation, ProductForm, NotificationCard,
                                NotificationPrompt, ConfirmDialog, LoadingSpinner, EmptyState, ...
  context/AuthContext.tsx       Signed-in user and data repository
  hooks/                        useAuth, useProducts, useNotifications, useProfile, useOnlineStatus
  lib/
    dateParser.ts               parseExpiryDate(): OCR text -> expiry date + confidence
    expiry.ts                   calculateDaysRemaining(), calculateExpiryStatus()
    reminders.ts                shouldSendReminder(), duplicate-safe reminder keys
    ocr.ts  imageProcessing.ts  Tesseract pipeline and canvas preprocessing
    productHints.ts             Product name / category suggestions from OCR text
    validation.ts  inventory.ts  stats.ts  dates.ts  errors.ts  theme.ts
    firebase.ts  firestore.ts  auth.ts  repository.ts  demoStore.ts  notifications.ts
    server/                     firebaseAdmin.ts, push.ts, reminderJob.ts, http.ts (server only)
  types/                        product.ts, notification.ts, user.ts
public/
  manifest.json  service-worker.js  offline.html  icons/
  ocr/                          Generated on install (Tesseract worker, core, eng data)
tests/
  unit/                         Vitest: parser, expiry, reminders, validation, inventory, stats, hints
  rules/                        Firestore emulator: security rules + scheduled reminder job
  e2e/                          Playwright: demo flows, real OCR scan, camera, responsive widths
  fixtures/milk-label.png
firestore.rules  firestore.indexes.json  firebase.json  vercel.json  .env.example
.github/workflows/              ci.yml, reminders.yml (free scheduler alternative)
scripts/                        copy-ocr-assets.mjs, generate-icons.mjs
```

## Installation

Requirements: **Node.js 20.9+** (22 recommended) and npm. Java 21 only if you want to run the Firestore emulator tests.

```bash
npm install          # also copies the OCR engine into public/ocr
cp .env.example .env.local
```

With an empty `.env.local` the app still runs in demo mode. Fill in the variables below to enable real accounts and push.

## Environment variables

| Variable | Secret? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | No (public by design) | Firebase web app config |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` | No | Service account identity |
| `FIREBASE_ADMIN_PRIVATE_KEY` | **Yes** | Service account key, one line with `\n` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | Web Push public key |
| `VAPID_PRIVATE_KEY` | **Yes** | Web Push private key |
| `VAPID_SUBJECT` | No | `mailto:` contact for push services |
| `CRON_SECRET` | **Yes** | Protects the scheduled reminder endpoint |
| `NEXT_PUBLIC_ENABLE_DEMO` | No | `false` hides demo mode |
| `NEXT_PUBLIC_TESSERACT_LANG_PATH` | No | Optional override for OCR language data |

Never commit `.env.local`. `.gitignore` already excludes it and service-account JSON files.

## Firebase setup

1. Go to <https://console.firebase.google.com>, **Add project** (Google Analytics not needed). The free **Spark** plan is enough.
2. **Build > Authentication > Get started.** Enable **Email/Password** and, optionally, **Google**.
3. **Authentication > Settings > Authorized domains:** add your deployed domain (for example `your-app.vercel.app`). `localhost` is there by default.
4. **Build > Firestore Database > Create database** in production mode, choosing a region near your users (for India, `asia-south1`).
5. **Project settings > General > Your apps > Web (`</>`)**, register an app, and copy the config values into the `NEXT_PUBLIC_FIREBASE_*` variables.
6. **Project settings > Service accounts > Generate new private key.** From the downloaded JSON, copy `project_id`, `client_email` and `private_key` into the `FIREBASE_ADMIN_*` variables. Keep the JSON file out of the repository.
7. Deploy the security rules:
   ```bash
   npx firebase login
   npx firebase use --add          # pick your project
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```
   You can also paste `firestore.rules` into **Firestore > Rules** in the console.

Cloud Functions and Firebase Storage are **not** used, because both require the paid Blaze plan for new projects. The optional product photo is a small (about 30 KB) JPEG stored inside the product document, and only if the user ticks the checkbox.

## OCR setup

Nothing to configure. `npm install` runs `scripts/copy-ocr-assets.mjs`, which copies the Tesseract.js worker, the LSTM WebAssembly cores and `eng.traineddata.gz` (about 15 MB in total, from the `tesseract.js`, `tesseract.js-core` and `@tesseract.js-data/eng` npm packages) into `public/ocr/`. The app loads them from your own site, so:

- no third-party CDN or paid OCR API is involved,
- images never leave the phone,
- after the first scan, the service worker caches the OCR files and scanning works offline.

The first scan downloads the engine (a few MB, compressed); later scans start immediately.

**Tips for good results:** good light, hold the phone steady, fill the frame with the date line, avoid glare on shiny packs. Dot-matrix and embossed dates are the hardest; use **Edit** or manual entry when needed.

## AI reading of expiry dates (free with Groq or Gemini)

The offline reader (Tesseract) cannot read the tiny dot-matrix codes on cans and many
bottles. With an AI key, each scan photo is first sent to an AI vision model through
`/api/scan/read` (signed-in users only); if none is set up, the phone is offline, or the
AI finds no expiry date, the offline reader is used as before.

Set one or more of these in `.env.local` (and in Vercel when you deploy). They are tried
in this order, and one that is busy or over its limit falls through to the next:

| Provider | Key | Cost | Model (optional) |
| --- | --- | --- | --- |
| Groq | `GROQ_API_KEY` from https://console.groq.com/keys | Free, no card | `GROQ_MODEL`, default `qwen/qwen3.8-27b` |
| Grok (xAI) | `XAI_API_KEY` from https://console.x.ai | Paid credits | `XAI_MODEL`, default `grok-4.7` |
| Gemini | `GEMINI_API_KEY` from https://aistudio.google.com/apikey | Free tier | `GEMINI_MODEL`, default `gemini-3.8-flash` (a retired model is replaced automatically) |

Restart the server. `/api/health` shows `"aiReading": true` and the providers in use.
Photos are shrunk to 2048 px on the longest side before upload.

Note: free tiers may use the photos to improve the provider's products. Pack photos
hold no personal data, but avoid photographing anything private.

## Family sharing

One household shares one food list; each member keeps their own notifications, so the
daily reminder job reminds every member once about the shared food.

- **Create:** Family sharing > *Create household*. Your current food list moves into it.
- **Invite:** share the link (`/join/ABC234`) or the code. New people can sign up from the
  link and land back on the join screen.
- **Join:** the joiner's own items move into the shared list too.
- **Leave:** the food stays with the household. The last member to leave takes it back and
  the household is closed. If the owner leaves, the next member becomes owner.
- **Remove (owner):** the person stops seeing the list and the invite code changes.

Households, invites and memberships are changed only by the server (`/api/household`, which
needs the Firebase Admin variables). The security rules let only members read or write a
household's food. **After updating, publish the new `firestore.rules`** (Firebase console >
Firestore > Rules, paste and Publish, or `npx firebase deploy --only firestore:rules`),
otherwise the shared list cannot load.

Data: `households/{id}` (name, owner, members, invite code), `households/{id}/products`,
`householdInvites/{code}`, and `users/{uid}.householdId`.

## Notification setup (VAPID Web Push)

1. Generate a key pair:
   ```bash
   npm run vapid
   ```
2. Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in `VAPID_PRIVATE_KEY`, and a contact in `VAPID_SUBJECT` (for example `mailto:you@example.com`).
3. Restart the app. In **Profile > Notifications**, tap **Enable Notifications**, allow the browser prompt, then tap **Send Test Notification**.

Standard Web Push with VAPID was chosen over Firebase Cloud Messaging because it needs no extra SDK or account and works with Chrome, Edge, Firefox, Samsung Internet and Safari (macOS, and iOS 16.4+ when installed to the Home Screen). Each device's subscription is stored in `users/{uid}/pushSubscriptions` by the server; expired subscriptions are removed automatically when a push service reports them gone.

Check what the server has configured at `GET /api/health` (it reports true/false, never values).

## Reminder scheduling

There are two complementary mechanisms, and both use the same engine (`src/lib/reminders.ts`) and the same notification ids (`{productId}_{TYPE}_{expiryDate}`), so a reminder is never recorded or pushed twice.

1. **Scheduled server job (delivers push when the app is closed).** `GET/POST /api/reminders/check` with `Authorization: Bearer <CRON_SECRET>` checks every user. For each due reminder it creates the notification document with `create()` (which fails if it already exists, the duplicate guard), sends push to the user's devices, and records `pushStatus` and `sentAt` only if a push service accepted it. "Today" is calculated in each user's own time zone.
   - **Vercel:** `vercel.json` schedules it daily at 03:30 UTC (09:00 IST). Vercel automatically sends `CRON_SECRET` if you set that environment variable. Hobby (free) cron jobs run **once per day** and the exact minute is not guaranteed within the hour.
   - **GitHub Actions (free alternative, or for more frequent runs):** `.github/workflows/reminders.yml`. Add repository secrets `APP_URL` and `CRON_SECRET`. GitHub may delay scheduled workflows during busy periods and disables them in public repositories with no activity for 60 days.
   - **Any other free cron service** (for example cron-job.org) can call the same URL with the header.
2. **In-app check (no infrastructure needed).** Whenever the app is opened, the browser runs the same engine, records any due reminders in the notification centre and, if permission is granted, shows them on that device. **Check reminders now** on the Notifications page triggers it on demand (and asks the server for signed-in users).

**Honest limitation:** without a scheduler, reminders appear only when the app is opened. Background push needs one of the schedulers above. With a daily schedule, a reminder arrives on the right day, not at an exact hour.

## Running locally

```bash
npm run dev           # http://localhost:3000
npm run dev:phone     # HTTPS on your network, so a phone on the same Wi-Fi can use the camera
```

The service worker is disabled in development to avoid stale caches. To test the PWA, camera and push on your phone:

```bash
npm run build && npm start
```

Phones only allow the camera and push on **HTTPS** (or `localhost`). To try the local build on a phone, either deploy a preview to Vercel or use a free HTTPS tunnel (for example `npx localtunnel --port 3000` or Cloudflare Tunnel) and add the tunnel domain to Firebase **Authorized domains**.

## Demo mode

Tap **Try the demo** on the landing page or the login page. Demo mode:

- loads sample products (Milk, Bread, Yogurt, Orange Juice, Paneer, Biscuits, Tomato Ketchup, Frozen Peas, plus a consumed and a discarded item) with dates **relative to today**, so every status is visible on any day of the demo,
- stores everything in this browser's `localStorage` only and never touches Firestore,
- is labelled "Demo mode" on every page; **Reset demo data** and **Exit demo** are in Settings,
- uses local notifications for **Send Test Notification** and reminders, and says so, because there is no server account to push to.

Set `NEXT_PUBLIC_ENABLE_DEMO=false` to hide it in production.

## Testing

```bash
npm test              # unit tests (Vitest)
npm run test:rules    # Firestore emulator: security rules + reminder job (needs Java 21)
npm run build && npm run test:e2e   # browser tests (Playwright, demo mode)
npm run typecheck
npm run lint
```

| Suite | Covers |
| --- | --- |
| `tests/unit/dateParser.test.ts` | All spec formats, MFG vs EXP, column layouts, best-before calculations, ambiguous dates, invalid dates, no date, multiple dates, OCR misreads (`2O/1O/2O26`) |
| `tests/unit/expiry.test.ts` | `calculateDaysRemaining()`, `calculateExpiryStatus()` with the spec test data: 30 days, 7 days, 3 days, tomorrow, today, yesterday, invalid date; leap years; time zones |
| `tests/unit/reminders.test.ts` | `shouldSendReminder()`: the 17 Oct example, reminder windows, duplicates, expiring today, a single expired reminder, consumed items, edited dates |
| `tests/unit/validation.test.ts`, `inventoryStats.test.ts`, `productHints.test.ts` | Form validation, image validation, search, filters, sorting, statistics, name/category suggestions |
| `tests/rules/firestore.rules.test.ts` | A user cannot read, create, modify or delete another user's products, notifications or profile; invalid data rejected; push subscriptions server-only |
| `tests/rules/reminderJob.test.ts` | Server job creates the right reminders in the user's time zone, never claims an unsent push, and does not duplicate on a second run |
| `tests/e2e/app.spec.ts` | Redirect to login, dashboard counts, manual add/validate/consume/delete, search/filter/sort, **real OCR on an uploaded label**, camera capture (fake camera), no horizontal scroll at 360/390/412 px, manifest and service worker, notification centre |

Push delivery to a real phone, Google sign-in and PWA installation depend on a real Firebase project, a public HTTPS URL and a physical device, so they are checked manually with the checklist below.

**Manual device checklist**
1. Open the deployed URL on an Android phone in Chrome. Register, then confirm you land on the dashboard.
2. Scan: allow the camera, capture a milk packet, check the confirmation screen, Confirm & Save.
3. Profile > Enable Notifications > allow > Send Test Notification. The notification should appear in the phone's notification shade; tapping it opens the app.
4. Browser menu > Install app (or Add to Home Screen). Open it from the home screen; it should open full-screen.
5. On iPhone (iOS 16.4+): Share > Add to Home Screen, open from the home screen, then enable notifications.

## Building for production

```bash
npm run build
npm start             # serves on port 3000
```

`npm run build` copies the OCR assets first (`prebuild`) and type-checks the project.

## Deployment (Vercel + Firebase)

1. Push this project to a GitHub repository.
2. On <https://vercel.com>, **Add New > Project**, import the repository. The framework is detected as Next.js; no build settings need changing.
3. In **Settings > Environment Variables**, add every variable from `.env.example` (mark the secret ones as sensitive).
4. Deploy. Vercel provides HTTPS automatically, which the camera, service worker and push all require.
5. Add the Vercel domain to Firebase **Authentication > Settings > Authorized domains**.
6. Deploy the Firestore rules (see [Firebase setup](#firebase-setup)).
7. Confirm `https://your-app.vercel.app/api/health` shows `true` for `firebaseClient`, `firebaseAdmin`, `webPush` and `cronSecret`.
8. The daily cron from `vercel.json` appears under **Settings > Cron Jobs**. Use **Run** there to trigger it once and check the result.

Any Node.js host works (Render, Railway, a VPS): run `npm run build && npm start` and use GitHub Actions or another cron service to call the reminder endpoint.

## PWA installation

- **Android (Chrome, Edge, Samsung Internet):** menu > **Install app** / **Add to Home screen**.
- **iPhone/iPad (Safari, iOS 16.4+):** Share > **Add to Home Screen**. Push notifications on iOS only work from the installed app.
- **Desktop (Chrome, Edge):** install icon in the address bar.

The manifest sets name *Food Expiry Reminder*, short name *Food Expiry*, `display: standalone`, theme colour, regular and maskable icons, and shortcuts to Scan and Expiring soon.

## Barcode scanning

While the camera is open, the scan page also looks for barcodes about four times a second. When one is seen, the phone vibrates and the app uses it straight away, with no button to press.

**Important: most food barcodes do not contain dates.** The usual EAN-13 / UPC barcode on a pack is only the product number; the manufacturing and expiry dates are printed separately (often by an inkjet or dot-matrix printer). So the app handles two kinds of barcode:

| Barcode | What the app gets | What happens next |
| --- | --- | --- |
| GS1 DataMatrix, GS1-128, GS1 QR / Digital Link (used on some packs, medicines, and more and more retail food) | Product number plus dates: `(11)` production, `(13)` packing, `(15)` best before, `(16)` sell by, `(17)` expiry, and the batch | Goes straight to **Detected information** with both dates filled in, for the user to confirm. |
| Ordinary EAN-13 / EAN-8 / UPC | Product number only | Looks up the product name and category, then asks the user to scan the printed date (OCR) or type it. The name found from the barcode is kept. |

Product names come from [Open Food Facts](https://world.openfoodfacts.org), a free public database; only the barcode number is sent. Unknown products, or no internet, simply leave the name blank.

Detection uses the browser's built-in `BarcodeDetector` where available (Chrome on Android) and otherwise a ZXing WebAssembly reader (about 1 MB) that `npm install` copies to `public/barcode/`, so it also works in Chrome on Windows.

## Mobile camera requirements

- HTTPS (or `localhost`); browsers block the camera on plain HTTP.
- The user must allow camera permission. If it is denied or unavailable, the app says *"Camera access was denied. Please allow camera permission or upload an image."* or *"Camera access is unavailable. You can upload an image instead."* and the **Upload Image** button always works.
- The rear camera is preferred with `facingMode: { ideal: "environment" }`; laptops fall back to the webcam.
- Only the area inside the on-screen frame (plus a small margin) is captured, which keeps OCR fast and focused on the date.

## Notification permissions

- Permission is requested only after the user taps **Enable Notifications**, never on page load.
- States shown: *Not requested*, *Granted*, *Denied*, *Not supported*.
- If denied, the app shows *"Notifications are disabled. You can enable them from your browser settings."* and does not ask again (browsers do not allow it anyway).
- The app never says a notification was sent unless the push service accepted it; the notification centre shows the real delivery status of each reminder.

## API reference

All endpoints except `/api/health` require `Authorization: Bearer <Firebase ID token>` (sent automatically by the app) and only act on the signed-in user's own data.

| Method | Path | Description | Responses |
| --- | --- | --- | --- |
| POST | `/api/notifications/subscribe` | Save this device's push subscription | 201, 400 invalid, 401, 503 not configured |
| DELETE | `/api/notifications/subscribe` | Remove a subscription by endpoint | 200, 400, 401 |
| POST | `/api/notifications/test` | Push "This is a test notification." to the user's devices | 200 `{sent, devices}`, 409 no devices, 502 push rejected, 401, 503 |
| GET/POST | `/api/reminders/check` | With `CRON_SECRET`: all users. With an ID token: the signed-in user only | 200 summary, 401, 503 |
| GET | `/api/health` | Which features are configured (booleans only) | 200 |

Product CRUD (`POST/GET/PUT/DELETE` of products) and the notification list are done directly with the Firestore client SDK under the security rules, instead of `/api/products` routes. This removes a server round trip, gives live updates and offline reading, keeps hosting free, and the rules (tested in `tests/rules`) enforce the same "own data only" guarantee an API would. OCR runs in the browser, so `/api/ocr` is not needed.

## Security

- Firestore rules (`firestore.rules`) allow each user to read and write only `users/{their uid}/...`, validate every product field, stop clients from rewriting `createdAt`, from claiming a push was sent, and from touching push subscriptions.
- Secrets (`FIREBASE_ADMIN_PRIVATE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) are read only in server code (`src/lib/server`, guarded by `server-only`) and never sent to the browser.
- The reminder endpoint accepts either the cron secret or a verified Firebase ID token.
- Login redirects only to same-site paths. Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`.
- Users see friendly messages only; technical errors go to the console.
- Writes are refused while offline, so the app never shows "saved" for data that has not reached the database.

## Frugal innovation and budget

| Resource | Cost |
| --- | --- |
| Smartphone, laptop, internet, browser | ₹0 (already owned) |
| Tesseract.js OCR | ₹0 (open source, runs on the phone) |
| Firebase Auth + Firestore (Spark plan) | ₹0 |
| Web Push (VAPID) | ₹0 |
| Vercel Hobby hosting and daily cron | ₹0 |
| GitHub Actions scheduler (optional) | ₹0 |
| **Total for the prototype** | **₹0** (within the ₹150 limit) |

No smart fridge, IoT sensors, RFID, Arduino, Raspberry Pi or dedicated scanner is needed. A custom domain (optional) is the only thing that would cost money.

The Firestore free tier (50,000 reads and 20,000 writes per day) is far more than a student project or hostel needs.

## Limitations

- **OCR accuracy depends on image quality.** Blur, glare, curved packs, dot-matrix and embossed print reduce accuracy. The user always confirms or corrects the result, and manual entry is always available.
- **Some expiry date formats are ambiguous.** `05/06/2026` can be 5 June or May 6. The app does not guess silently: it uses other dates on the pack when they reveal the order, otherwise it asks the user to choose. Day-first is the default reading.
- **Month-only dates** (`EXP OCT 2026`) are stored as the last day of that month, and the confirmation screen says so.
- **"Best before N months"** dates are calculated from the manufacturing date and labelled as calculated, not printed.
- **Browser notification support varies** by browser and operating system. iOS requires the app to be installed to the Home Screen (iOS 16.4+). Some Android battery savers delay notifications.
- **Push notifications require user permission**, and cannot be re-requested after the user denies them.
- **Camera access requires HTTPS** in deployed environments.
- **Scheduling on free hosting runs once a day**, at an approximate time. Without any scheduler, reminders appear only when the app is opened.
- **The system does not assume OCR is always correct.** Nothing is saved without user confirmation.
- Usage statistics are based only on what users record; they are not a scientific measure of food waste.
