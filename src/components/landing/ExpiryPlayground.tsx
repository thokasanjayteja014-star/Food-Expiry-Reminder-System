"use client";

import { useState } from "react";
import { Bell, CalendarDays } from "lucide-react";
import { calculateExpiryStatus, describeDaysRemaining } from "@/lib/expiry";
import { addDays, formatDateLong, todayISO } from "@/lib/dates";
import { StatusBadge } from "@/components/StatusBadge";

const FOODS = [
  { name: "Milk", days: 2 },
  { name: "Bread", days: 1 },
  { name: "Curd", days: 0 },
  { name: "Ketchup", days: 120 },
];
const REMINDERS = [1, 3, 5, 7];

/** "Try it" box: pick when a food expires and see what the app would show and when it would remind you. */
export function ExpiryPlayground() {
  const [today] = useState(() => todayISO());
  const [days, setDays] = useState(2);
  const [remind, setRemind] = useState(3);
  const [food, setFood] = useState("Milk");
  const base = today;
  const expiry = addDays(base, days);
  const status = calculateExpiryStatus(expiry, base);
  const reminderDay = addDays(expiry, -remind);
  const reminderText =
    days < 0
      ? "Already expired. You would see it at the top of your list."
      : reminderDay <= base
        ? `You would be reminded today: "${food} ${days === 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`}."`
        : `You would be reminded on ${formatDateLong(reminderDay)}, ${remind} day${remind === 1 ? "" : "s"} before.`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-5 p-5 sm:p-6">
        <div>
          <p className="label">Pick a food</p>
          <div className="flex flex-wrap gap-2">
            {FOODS.map((f) => (
              <button
                key={f.name}
                type="button"
                aria-pressed={food === f.name}
                onClick={() => {
                  setFood(f.name);
                  setDays(f.days);
                }}
                className={`chip press ${
                  food === f.name ? "border-[var(--text)] bg-[var(--text)] text-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="play-days" className="label flex items-center justify-between">
            <span>Expires in</span>
            <span className="tabular-nums muted">{days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : `${days} day${days === 1 ? "" : "s"}`}</span>
          </label>
          <input
            id="play-days"
            type="range"
            min={-5}
            max={30}
            value={Math.min(days, 30)}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full accent-[var(--color-brand-600)]"
          />
        </div>
        <div>
          <p className="label">Remind me</p>
          <div className="grid grid-cols-4 gap-2">
            {REMINDERS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={remind === r}
                onClick={() => setRemind(r)}
                className={`press rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  remind === r ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {r} day{r === 1 ? "" : "s"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card flex flex-col justify-between gap-5 bg-[var(--surface-2)] p-5 sm:p-6" aria-live="polite">
        <div>
          <p className="text-xs font-medium muted">What you would see</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{food}</p>
              <p className="flex items-center gap-1.5 text-sm muted">
                <CalendarDays aria-hidden className="size-3.5" />
                {today ? formatDateLong(expiry) : " "}
              </p>
            </div>
            <div className="text-right">
              <StatusBadge status={status} />
              <p className="mt-1 text-xs font-medium">{describeDaysRemaining(days)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-[var(--surface)] p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bell aria-hidden className="size-4" />
          </span>
          <p className="text-sm" suppressHydrationWarning>
            {reminderText}
          </p>
        </div>
      </div>
    </div>
  );
}
