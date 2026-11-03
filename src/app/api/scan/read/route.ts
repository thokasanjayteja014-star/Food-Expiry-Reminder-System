import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/server/http";
import { isVisionConfigured, readPackWithVision } from "@/lib/server/vision";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/scan/read { image: base64, mimeType }: reads the dates on a pack photo with the
 * vision model. Signed-in users only, so the API key cannot be used by anyone else.
 */
export async function POST(request: Request) {
  if (!isVisionConfigured()) return jsonError(503, "AI reading is not configured on this server.");
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "Send the photo as JSON.");
  }
  const image = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
  if (!image || !IMAGE_TYPES.has(mimeType)) return jsonError(400, "Send a JPEG, PNG or WebP photo.");
  if (image.length * 0.75 > MAX_IMAGE_BYTES) return jsonError(413, "The photo is too large.");

  try {
    return NextResponse.json({ ok: true, ...(await readPackWithVision(image, mimeType)) });
  } catch (error) {
    console.error("Vision reading failed", (error as Error).message);
    return jsonError(502, "The AI reader could not read this photo. Check the AI keys in .env.local.");
  }
}
