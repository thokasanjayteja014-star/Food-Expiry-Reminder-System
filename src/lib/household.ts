/** Client helpers for family sharing. Every change goes through /api/household on the server. */
import { doc, onSnapshot } from "firebase/firestore";
import type { Household } from "@/types/user";
import { getIdToken } from "./auth";
import { getDb } from "./firebase";
import { isOnline } from "./errors";

export type HouseholdResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function call<T>(init: { method: "GET" | "POST"; query?: string; body?: Record<string, unknown> }): Promise<HouseholdResult<T>> {
  if (!isOnline()) return { ok: false, message: "You are offline. Connect to the internet and try again." };
  const token = await getIdToken().catch(() => null);
  if (!token) return { ok: false, message: "Please log in again." };
  try {
    const res = await fetch(`/api/household${init.query ?? ""}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: typeof data.error === "string" ? data.error : "Something went wrong. Please try again." };
    return { ...(data as T), ok: true };
  } catch {
    return { ok: false, message: "Could not reach the server. Please try again." };
  }
}

export const createHousehold = (name: string) =>
  call<{ householdId: string; inviteCode: string }>({ method: "POST", body: { action: "create", name } });
export const joinHousehold = (code: string) => call<{ householdId: string; name: string }>({ method: "POST", body: { action: "join", code } });
export const previewInvite = (code: string) =>
  call<{ name: string; memberCount: number }>({ method: "GET", query: `?code=${encodeURIComponent(code)}` });
export const leaveHousehold = () => call({ method: "POST", body: { action: "leave" } });
export const removeMember = (memberId: string) => call({ method: "POST", body: { action: "remove", memberId } });
export const renewInviteCode = () => call<{ inviteCode: string }>({ method: "POST", body: { action: "renewCode" } });
export const renameHousehold = (name: string) => call({ method: "POST", body: { action: "rename", name } });
export const syncMemberName = () => call({ method: "POST", body: { action: "syncName" } });

/** The link that opens the join screen for a code. */
export function inviteLink(code: string, origin = typeof window === "undefined" ? "" : window.location.origin): string {
  return `${origin}/join/${code}`;
}

/** Live household details for members. */
export function subscribeHousehold(
  id: string,
  onData: (household: Household | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), "households", id),
    (snap) => {
      if (!snap.exists()) return onData(null);
      const d = snap.data();
      const memberIds = Array.isArray(d.memberIds) ? (d.memberIds as string[]) : [];
      const names = (d.members ?? {}) as Record<string, { name?: string }>;
      onData({
        id: snap.id,
        name: String(d.name ?? ""),
        ownerId: String(d.ownerId ?? ""),
        memberIds,
        members: memberIds.map((uid) => ({ uid, name: names[uid]?.name || "Member" })),
        inviteCode: String(d.inviteCode ?? ""),
      });
    },
    onError,
  );
}
