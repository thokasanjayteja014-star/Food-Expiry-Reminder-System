"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, Crown, Loader2, LogOut, RefreshCcw, Share2, UserMinus, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";
import {
  createHousehold,
  inviteLink,
  joinHousehold,
  leaveHousehold,
  removeMember,
  renameHousehold,
  renewInviteCode,
  type HouseholdResult,
} from "@/lib/household";
import { PageHeader } from "@/components/PageHeader";
import { Alert } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FullPageLoader } from "@/components/LoadingSpinner";

type Msg = { ok: boolean; text: string } | null;

export default function HouseholdPage() {
  const { user } = useAuth();
  const { household, householdId, loading, error } = useHousehold();
  const [msg, setMsg] = useState<Msg>(null);

  if (user?.isDemo) {
    return (
      <>
        <PageHeader title="Family sharing" />
        <Alert tone="info">Family sharing needs a real account. Sign up or log in to share your food list.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Family sharing" description="Share one food list with your family or flatmates. Everyone gets the reminders." />
      {msg && (
        <Alert tone={msg.ok ? "success" : "error"} className="mb-4">
          {msg.text}
        </Alert>
      )}
      {!householdId ? (
        <NoHousehold onMessage={setMsg} />
      ) : loading ? (
        <FullPageLoader label="Loading your household..." />
      ) : household && user ? (
        <HouseholdView household={household} uid={user.uid} onMessage={setMsg} />
      ) : (
        <Alert tone="error">{error ? "We couldn't load your household. Check your connection and try again." : "This household no longer exists."}</Alert>
      )}
    </>
  );
}

function useAction(onMessage: (m: Msg) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T>(key: string, fn: () => Promise<HouseholdResult<T>>, success?: string | ((r: T) => string)) {
    setBusy(key);
    onMessage(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) onMessage({ ok: false, text: r.message });
    else if (success) onMessage({ ok: true, text: typeof success === "string" ? success : success(r as unknown as T) });
    return r.ok;
  }
  return { busy, run };
}

function NoHousehold({ onMessage }: { onMessage: (m: Msg) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { busy, run } = useAction(onMessage);

  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <form
        className="card animate-in space-y-3 p-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run("create", () => createHousehold(name), "Household created. Share the invite code with your family.");
        }}
      >
        <h2 className="text-lg font-semibold">Create a household</h2>
        <p className="text-sm muted">Your current food list moves into the household, so nothing is lost.</p>
        <div>
          <label htmlFor="household-name" className="label">Household name</label>
          <input id="household-name" className="input" placeholder="For example: Sharma Home" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === "create" && <Loader2 aria-hidden className="size-4 animate-spin" />} Create household
        </button>
      </form>

      <form
        className="card animate-in space-y-3 p-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run("join", () => joinHousehold(code), (r: { name: string }) => `You joined ${r.name}.`);
        }}
      >
        <h2 className="text-lg font-semibold">Join with a code</h2>
        <p className="text-sm muted">Ask a family member for their 6-character invite code. Your food list joins theirs.</p>
        <div>
          <label htmlFor="invite-code" className="label">Invite code</label>
          <input
            id="invite-code"
            className="input font-mono uppercase tracking-widest"
            placeholder="ABC234"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={busy !== null || code.replace(/[\s-]/g, "").length !== 6}>
          {busy === "join" && <Loader2 aria-hidden className="size-4 animate-spin" />} Join household
        </button>
      </form>
    </div>
  );
}

function HouseholdView({
  household,
  uid,
  onMessage,
}: {
  household: import("@/types/user").Household;
  uid: string;
  onMessage: (m: Msg) => void;
}) {
  const { busy, run } = useAction(onMessage);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [removing, setRemoving] = useState<{ uid: string; name: string } | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const isOwner = household.ownerId === uid;
  const link = inviteLink(household.inviteCode);
  const alone = household.memberIds.length === 1;

  async function share() {
    const text = `Join our food list "${household.name}" on Food Expiry Reminder. Code: ${household.inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my household", text, url: link });
        return;
      } catch {
        // Cancelled or not allowed: copy instead.
      }
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onMessage({ ok: false, text: `Copy this link: ${link}` });
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <section className="card animate-in p-5" aria-labelledby="household-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="household-h" className="flex items-center gap-2 text-lg font-semibold">
            <Users aria-hidden className="size-5 text-brand-600" /> {household.name}
          </h2>
          {isOwner && newName === null && (
            <button type="button" className="btn-secondary" onClick={() => setNewName(household.name)}>
              Rename
            </button>
          )}
        </div>
        {newName !== null && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("rename", () => renameHousehold(newName), "Household renamed.")) setNewName(null);
            }}
          >
            <label htmlFor="rename" className="sr-only">New name</label>
            <input id="rename" className="input max-w-xs" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} />
            <button type="submit" className="btn-primary" disabled={busy !== null || !newName.trim()}>Save</button>
            <button type="button" className="btn-secondary" onClick={() => setNewName(null)}>Cancel</button>
          </form>
        )}
        <p className="mt-2 text-sm muted">Everyone here sees and edits the same food list, and each member gets the expiry reminders.</p>

        <h3 className="mt-5 text-sm font-semibold">Members ({household.members.length})</h3>
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {household.members.map((m) => (
            <li key={m.uid} className="flex items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <span className="font-medium">{m.name}</span>
                {m.uid === uid && <span className="text-xs muted">(you)</span>}
                {m.uid === household.ownerId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                    <Crown aria-hidden className="size-3" /> Owner
                  </span>
                )}
              </span>
              {isOwner && m.uid !== uid && (
                <button type="button" className="btn-secondary text-red-700 dark:text-red-400" onClick={() => setRemoving(m)} aria-label={`Remove ${m.name}`}>
                  <UserMinus aria-hidden className="size-4" /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card animate-in p-5" aria-labelledby="invite-h">
        <h2 id="invite-h" className="text-lg font-semibold">Invite your family</h2>
        <p className="mt-1 text-sm muted">Send them the link, or tell them the code to enter under Family sharing.</p>
        <p className="mt-4 font-mono text-3xl font-bold tracking-[0.3em]" data-testid="invite-code">{household.inviteCode}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={share}>
            <Share2 aria-hidden className="size-4" /> Share invite
          </button>
          <button type="button" className="btn-secondary" onClick={copy}>
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? "Link copied" : "Copy link"}
          </button>
          {isOwner && (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() => run("code", renewInviteCode, "New invite code made. The old code and link no longer work.")}
            >
              {busy === "code" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCcw aria-hidden className="size-4" />} New code
            </button>
          )}
        </div>
      </section>

      <button type="button" className="btn-secondary text-red-700 dark:text-red-400" onClick={() => setConfirmLeave(true)}>
        <LogOut aria-hidden className="size-4" /> Leave household
      </button>

      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${household.name}?`}
        description={
          alone
            ? "You are the only member. The household is closed and its food list moves back to your own list."
            : "The shared food list stays with the household. You start again with an empty list of your own."
        }
        confirmLabel="Leave"
        busy={busy === "leave"}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={async () => {
          await run("leave", leaveHousehold, "You left the household.");
          setConfirmLeave(false);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ""}?`}
        description="They stop seeing this food list and getting its reminders. The invite code changes so they cannot rejoin with the old one."
        confirmLabel="Remove"
        busy={busy === "remove"}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await run("remove", () => removeMember(removing.uid), `${removing.name} was removed.`);
          setRemoving(null);
        }}
      />
    </div>
  );
}
