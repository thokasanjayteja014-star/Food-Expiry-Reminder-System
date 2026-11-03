"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight, FlaskConical, Loader2, LogOut, Moon, RefreshCcw, Shield, Trash2, User, Users } from "lucide-react";
import { REMINDER_OPTIONS } from "@/types/product";
import type { ThemePreference } from "@/types/user";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { applyTheme, getTheme } from "@/lib/theme";
import { friendlyMessage } from "@/lib/errors";
import { DemoRepository } from "@/lib/demoStore";
import { PageHeader } from "@/components/PageHeader";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { EmailReminders } from "@/components/EmailReminders";
import { PrivacyContent } from "@/components/PrivacyContent";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert } from "@/components/Alert";
import { syncMemberName } from "@/lib/household";

export default function SettingsPage() {
  const router = useRouter();
  const { user, repo, householdId, logout, setDisplayName } = useAuth();
  const { profile, update, defaultReminderDays } = useProfile();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("light");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync local form state once the profile and saved theme are available.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setName(profile?.name ?? user?.name ?? ""), [profile?.name, user?.name]);
  useEffect(() => setTheme(getTheme()), []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMsg({ ok: false, text: "Please enter your name." });
    setSaving(true);
    try {
      await update({ name: name.trim() });
      setDisplayName(name.trim());
      // Household members see the new name too.
      if (householdId) void syncMemberName();
      setMsg({ ok: true, text: "Profile updated." });
    } catch (err) {
      setMsg({ ok: false, text: friendlyMessage(err) });
    }
    setSaving(false);
  }

  async function saveReminder(days: number) {
    try {
      await update({ defaultReminderDays: days });
      setMsg({ ok: true, text: `New products will remind you ${days} day${days > 1 ? "s" : ""} before expiry.` });
    } catch (err) {
      setMsg({ ok: false, text: friendlyMessage(err) });
    }
  }

  return (
    <>
      <PageHeader title="Profile & settings" />
      {msg && <Alert tone={msg.ok ? "success" : "error"} className="mb-4">{msg.text}</Alert>}

      <div className="grid max-w-3xl gap-4">
        <Card Icon={User} title="Profile">
          <form onSubmit={saveName} className="space-y-3">
            <div>
              <label htmlFor="profile-name" className="label">Name</label>
              <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
            </div>
            <p className="text-sm muted">Email: {user?.isDemo ? "Demo mode (no account)" : user?.email}</p>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 aria-hidden className="size-4 animate-spin" />} Save
            </button>
          </form>
        </Card>

        <Card Icon={Users} title="Family sharing">
          <Link href="/household" className="group -m-2 flex items-center justify-between gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--surface-2)]">
            <span className="text-sm">
              {householdId
                ? "You share a food list with your household. Manage members and invites."
                : "Share one food list with your family or flatmates so everyone gets the reminders."}
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 muted" />
          </Link>
        </Card>

        <Card Icon={Bell} title="Notifications" id="notifications">
          <NotificationPrompt variant="settings" />
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <EmailReminders />
          </div>
          <fieldset className="mt-5">
            <legend className="label">Default reminder period</legend>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={defaultReminderDays === d}
                  onClick={() => saveReminder(d)}
                  className={`btn border ${
                    defaultReminderDays === d
                      ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {d} day{d > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs muted">Used for new products. You can change it per product when adding or editing.</p>
          </fieldset>
        </Card>

        <Card Icon={Moon} title="Theme">
          <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => {
                  setTheme(t);
                  applyTheme(t);
                }}
                className={`btn border capitalize ${
                  theme === t ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Card>

        {user?.isDemo && (
          <Card Icon={FlaskConical} title="Demo mode">
            <p className="text-sm muted">
              You are using sample data stored only in this browser. Nothing is saved to the cloud, and demo data never mixes with real accounts.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => { DemoRepository.reset(); setMsg({ ok: true, text: "Demo data has been reset." }); }}>
                <RefreshCcw aria-hidden className="size-4" /> Reset demo data
              </button>
            </div>
          </Card>
        )}

        <Card Icon={Shield} title="Privacy">
          <PrivacyContent />
          <button type="button" className="btn-secondary mt-4 text-red-700 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden className="size-4" /> {householdId ? "Delete all my notifications" : "Delete all my products and notifications"}
          </button>
        </Card>

        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut aria-hidden className="size-4" /> {user?.isDemo ? "Exit demo" : "Logout"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete all your data?"
        description={
          householdId
            ? "Your notifications will be permanently deleted. The shared food list belongs to your household, so it stays; leave the household first to take your data out."
            : "All your products and notifications will be permanently deleted. Your account stays so you can start again."
        }
        confirmLabel="Delete everything"
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await repo?.deleteAllData();
            setMsg({ ok: true, text: householdId ? "All your notifications were deleted." : "All your products and notifications were deleted." });
          } catch (err) {
            setMsg({ ok: false, text: friendlyMessage(err, "We couldn't delete your data. Please try again.") });
          }
          setDeleting(false);
          setConfirmDelete(false);
        }}
      />
    </>
  );
}

function Card({ Icon, title, id, children }: { Icon: typeof User; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${title}-h`} className="card animate-in scroll-mt-20 p-5">
      <h2 id={`${title}-h`} className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon aria-hidden className="size-5 text-brand-600" /> {title}
      </h2>
      {children}
    </section>
  );
}
