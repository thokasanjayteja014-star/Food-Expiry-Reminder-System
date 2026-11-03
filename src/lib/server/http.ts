import "server-only";
import { NextResponse } from "next/server";
import { adminAuth, isAdminConfigured } from "./firebaseAdmin";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Verifies the Firebase ID token in "Authorization: Bearer <token>" and returns the uid. */
export async function requireUser(request: Request): Promise<{ uid: string } | NextResponse> {
  if (!isAdminConfigured()) {
    return jsonError(503, "The server is not configured for notifications yet.");
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return jsonError(401, "Please log in again.");
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return jsonError(401, "Your session has expired. Please log in again.");
  }
}

/** True when the request carries the shared cron secret (Vercel Cron sends it automatically). */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
