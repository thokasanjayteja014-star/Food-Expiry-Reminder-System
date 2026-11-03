import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/server/http";
import {
  createHousehold,
  HouseholdError,
  joinHousehold,
  leaveHousehold,
  previewInvite,
  removeHouseholdMember,
  renameHousehold,
  renewInviteCode,
  syncMemberName,
} from "@/lib/server/household";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof HouseholdError) return jsonError(error.status, error.message);
  console.error("Household request failed", error);
  return jsonError(500, "Something went wrong. Please try again.");
}

/** GET /api/household?code=ABC123: the household name for an invite, before joining. */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ ok: true, ...(await previewInvite(new URL(request.url).searchParams.get("code"))) });
  } catch (error) {
    return fail(error);
  }
}

/**
 * POST /api/household { action, ... } for the signed-in user:
 * create {name} | join {code} | leave | remove {memberId} | renewCode | rename {name} | syncName
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Invalid request.");
  }
  try {
    switch (body.action) {
      case "create":
        return NextResponse.json({ ok: true, ...(await createHousehold(auth.uid, body.name)) });
      case "join":
        return NextResponse.json({ ok: true, ...(await joinHousehold(auth.uid, body.code)) });
      case "leave":
        await leaveHousehold(auth.uid);
        return NextResponse.json({ ok: true });
      case "remove":
        await removeHouseholdMember(auth.uid, body.memberId);
        return NextResponse.json({ ok: true });
      case "renewCode":
        return NextResponse.json({ ok: true, inviteCode: await renewInviteCode(auth.uid) });
      case "rename":
        await renameHousehold(auth.uid, body.name);
        return NextResponse.json({ ok: true });
      case "syncName":
        await syncMemberName(auth.uid);
        return NextResponse.json({ ok: true });
      default:
        return jsonError(400, "Unknown action.");
    }
  } catch (error) {
    return fail(error);
  }
}
