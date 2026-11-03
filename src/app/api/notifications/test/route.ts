import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { jsonError, requireUser } from "@/lib/server/http";
import { isPushConfigured, sendPushToUser } from "@/lib/server/push";
import { REMINDER_TITLE } from "@/lib/reminders";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * POST /api/notifications/test: sends "This is a test notification." to the signed-in
 * user's own devices only. Reports how many devices accepted it; never claims success otherwise.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!isPushConfigured()) return jsonError(503, "Push notifications are not configured on this server yet.");

  const message = "This is a test notification.";
  const { sent, devices } = await sendPushToUser(auth.uid, {
    title: `🔔 ${REMINDER_TITLE}`,
    body: message,
    url: "/notifications",
    tag: "test",
  });
  if (devices === 0) return jsonError(409, "No devices are subscribed. Please enable notifications first.");

  await adminDb()
    .collection("users")
    .doc(auth.uid)
    .collection("notifications")
    .add({
      title: REMINDER_TITLE,
      message,
      productId: null,
      type: "TEST",
      scheduledFor: todayISO(),
      sentAt: sent > 0 ? FieldValue.serverTimestamp() : null,
      pushStatus: sent > 0 ? "sent" : "failed",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

  if (sent === 0) return jsonError(502, "The push service did not accept the notification. Please try enabling notifications again.");
  return NextResponse.json({ ok: true, sent, devices });
}
