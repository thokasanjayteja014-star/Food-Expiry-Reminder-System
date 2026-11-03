import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/server/firebaseAdmin";
import { isCronRequest, jsonError, requireUser } from "@/lib/server/http";
import { runReminderJobForAllUsers, runReminderJobForUser } from "@/lib/server/reminderJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reminder check.
 *  - With "Authorization: Bearer <CRON_SECRET>": checks every user (used by the scheduler).
 *  - With a Firebase ID token: checks only the signed-in user ("Check reminders now").
 */
async function handle(request: Request) {
  if (!isAdminConfigured()) return jsonError(503, "The server is not configured for reminders yet.");
  if (isCronRequest(request)) {
    const summary = await runReminderJobForAllUsers();
    return NextResponse.json({ ok: true, scope: "all", ...summary });
  }
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const summary = await runReminderJobForUser(auth.uid);
  return NextResponse.json({ ok: true, scope: "user", ...summary });
}

// Vercel Cron Jobs call GET; other schedulers can use POST.
export const GET = handle;
export const POST = handle;
