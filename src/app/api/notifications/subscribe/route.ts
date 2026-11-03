import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { jsonError, requireUser } from "@/lib/server/http";
import { isPushConfigured, isValidSubscription, subscriptionId } from "@/lib/server/push";

export const runtime = "nodejs";

/** POST /api/notifications/subscribe: store this device's push subscription for the signed-in user. */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!isPushConfigured()) return jsonError(503, "Push notifications are not configured on this server yet.");

  const body = (await request.json().catch(() => null)) as { subscription?: unknown; timeZone?: unknown } | null;
  if (!body || !isValidSubscription(body.subscription)) return jsonError(400, "Invalid push subscription.");

  const userRef = adminDb().collection("users").doc(auth.uid);
  await userRef
    .collection("pushSubscriptions")
    .doc(subscriptionId(body.subscription.endpoint))
    .set(
      {
        subscription: { endpoint: body.subscription.endpoint, keys: body.subscription.keys },
        userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? "",
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  const update: Record<string, unknown> = { notificationsEnabled: true };
  if (typeof body.timeZone === "string" && body.timeZone.length < 64) update.timeZone = body.timeZone;
  await userRef.set(update, { merge: true });

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE /api/notifications/subscribe: remove this device's subscription. */
export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!body || typeof body.endpoint !== "string") return jsonError(400, "Missing endpoint.");
  await adminDb()
    .collection("users")
    .doc(auth.uid)
    .collection("pushSubscriptions")
    .doc(subscriptionId(body.endpoint))
    .delete();
  return NextResponse.json({ ok: true });
}
