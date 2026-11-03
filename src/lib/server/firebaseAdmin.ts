/**
 * Firebase Admin SDK (server only). Credentials come from environment variables and
 * are never sent to the browser.
 */
import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Local Firestore emulator (tests and development) needs no credentials. */
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_ADMIN_PROJECT_ID);

export function isAdminConfigured(): boolean {
  if (usingEmulator) return true;
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  );
}

function adminApp(): App {
  if (getApps().length) return getApp();
  if (usingEmulator && !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    return initializeApp({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID });
  }
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Env vars store the key with literal "\n"; restore real newlines.
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
