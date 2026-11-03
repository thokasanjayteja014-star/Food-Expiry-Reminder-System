import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/server/http";
import { accountEmail, appUrl, isEmailConfigured, reminderDigest, sendEmail, sendVerificationEmail } from "@/lib/server/email";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/notifications/test-email: emails the signed-in user's own address.
 * If the address is not verified yet, sends a verification link instead.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!isEmailConfigured()) return jsonError(503, "Email reminders are not configured on this server yet.");

  const { email, verified } = await accountEmail(auth.uid);
  if (!email) return jsonError(409, "Your account has no email address.");
  const base = appUrl(new URL(request.url).origin);
  try {
    if (!verified) {
      await sendVerificationEmail(email, base ? `${base}/settings` : undefined);
      return NextResponse.json({ ok: true, verificationSent: true, email });
    }
    const profile = await adminDb().collection("users").doc(auth.uid).get();
    const { subject, text, html } = reminderDigest(
      (profile.get("name") as string | undefined) ?? "",
      [{ title: "Test", message: "This is a test email reminder.", url: "/notifications" }],
      base,
    );
    await sendEmail(email, subject, text, html);
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    console.error("Test email failed", (error as Error).message);
    return jsonError(502, "The email could not be sent. Check BREVO_API_KEY and that EMAIL_FROM is a verified sender in Brevo (or the SMTP settings).");
  }
}
