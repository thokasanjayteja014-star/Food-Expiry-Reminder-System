import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/server/firebaseAdmin";
import { isPushConfigured } from "@/lib/server/push";
import { isEmailConfigured } from "@/lib/server/email";
import { isVisionConfigured, visionProviders } from "@/lib/server/vision";

export const dynamic = "force-dynamic";

/** GET /api/health: which features are configured (never returns secret values). */
export function GET() {
  return NextResponse.json({
    ok: true,
    firebaseClient: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    firebaseAdmin: isAdminConfigured(),
    webPush: isPushConfigured(),
    email: isEmailConfigured(),
    aiReading: isVisionConfigured(),
    aiProviders: visionProviders(),
    cronSecret: Boolean(process.env.CRON_SECRET),
  });
}
