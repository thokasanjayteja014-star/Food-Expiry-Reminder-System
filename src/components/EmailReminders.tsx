"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { sendTestEmail } from "@/lib/notifications";
import { friendlyMessage } from "@/lib/errors";
import { Alert } from "./Alert";

/** Settings: turn the daily reminder email on or off and send a test email. */
export function EmailReminders() {
  const { user } = useAuth();
  const { profile, update } = useProfile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const enabled = profile?.emailReminders !== false;

  if (user?.isDemo) {
    return <p className="text-sm muted">Email reminders need a real account. Sign up or log in to use them.</p>;
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-brand-600"
          checked={enabled}
          onChange={async (e) => {
            try {
              await update({ emailReminders: e.target.checked });
              setMsg({ ok: true, text: e.target.checked ? "Email reminders are on." : "Email reminders are off." });
            } catch (err) {
              setMsg({ ok: false, text: friendlyMessage(err) });
            }
          }}
        />
        <span>
          <span className="font-medium">Email me reminders</span>
          <span className="block text-sm muted">One email a day to {user?.email || "your sign-in address"}, listing products that are about to expire.</span>
        </span>
      </label>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy || !enabled}
        onClick={async () => {
          setBusy(true);
          const r = await sendTestEmail();
          setMsg(
            r.ok
              ? {
                  ok: true,
                  text: r.verificationSent
                    ? `We sent a verification link to ${r.email}. Open it, then send the test again.`
                    : `Test email sent to ${r.email}. Check your inbox (and the spam folder).`,
                }
              : { ok: false, text: r.message },
          );
          setBusy(false);
        }}
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Mail aria-hidden className="size-4" />} Send test email
      </button>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
