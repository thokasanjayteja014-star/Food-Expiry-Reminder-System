import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, ScanLine, ShieldCheck, Users } from "lucide-react";
import { LogoMark } from "./Logo";

const POINTS = [
  { Icon: ScanLine, title: "Scan in seconds", text: "Read the date straight off the pack." },
  { Icon: BellRing, title: "Timely reminders", text: "1 to 7 days before food goes off." },
  { Icon: Users, title: "One family list", text: "Everyone sees what to use first." },
];

/** What the app shows after signing in: a small, real slice of the "use these first" list. */
const PREVIEW = [
  { name: "Milk", place: "Dairy · Fridge", when: "Tomorrow", strong: true },
  { name: "Paneer", place: "Dairy · Fridge", when: "In 3 days", strong: false },
  { name: "Bread", place: "Bakery · Shelf", when: "In 4 days", strong: false },
];

function Brand() {
  return (
    <Link href="/" className="flex w-fit items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-tight text-navy focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/25">
      <LogoMark className="size-9" tone="blue" />
      Food Expiry Reminder
    </Link>
  );
}

function ListPreview() {
  return (
    <figure className="rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(20,43,77,0.06),0_12px_32px_-16px_rgba(36,87,197,0.25)]">
      <figcaption className="flex items-center justify-between">
        <span className="text-sm font-semibold text-navy">Use these first</span>
        <span className="rounded-md bg-ice px-2 py-0.5 text-xs font-medium text-royal">3 items</span>
      </figcaption>
      <ul className="mt-4 divide-y divide-line">
        {PREVIEW.map((p) => (
          <li key={p.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <span className="flex items-center gap-3">
              <span className={`size-2 rounded-full ${p.strong ? "bg-royal" : "bg-sky"}`} />
              <span>
                <span className="block text-sm font-medium text-navy">{p.name}</span>
                <span className="block text-xs text-slate-blue">{p.place}</span>
              </span>
            </span>
            <span className={`text-xs ${p.strong ? "font-semibold text-royal" : "text-slate-blue"}`}>{p.when}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-ice px-3 py-2.5 text-xs text-navy">
        <BellRing aria-hidden className="size-4 shrink-0 text-royal" />
        Reminder sent: Milk expires tomorrow.
      </div>
    </figure>
  );
}

/**
 * Sign-in layout. Large screens: a light-blue brand panel on the left, the form on white
 * on the right. Phones: the brand shrinks to a top bar, the form comes first, and the
 * three points follow it as a compact list.
 */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="auth-scope grid min-h-dvh bg-white text-navy lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-ice lg:flex lg:flex-col lg:px-12 lg:py-10 xl:px-16">
        {/* One quiet accent: a soft cyan wash in the top corner. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_100%_0%,rgba(189,235,250,0.7),transparent)]" />
        <div className="relative">
          <Brand />
        </div>
        <div className="relative my-auto max-w-md py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-royal">Less waste, every week</p>
          <h2 className="mt-3 text-[2rem] font-semibold leading-[1.15] tracking-tight text-navy xl:text-[2.25rem]">
            Know what to eat first, before it goes off.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-blue">
            Scan the expiry date on anything you buy. Food Expiry Reminder keeps one sorted list for your home and nudges you before milk, bread or curd is wasted.
          </p>
          <div className="mt-8">
            <ListPreview />
          </div>
        </div>
        <ul className="relative grid grid-cols-3 gap-4 border-t border-line pt-6">
          {POINTS.map(({ Icon, title: t, text }) => (
            <li key={t}>
              <Icon aria-hidden className="size-5 text-royal" />
              <p className="mt-2 text-sm font-semibold text-navy">{t}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-blue">{text}</p>
            </li>
          ))}
        </ul>
      </aside>

      <main id="main" className="flex flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8 lg:hidden">
          <Brand />
        </header>
        <div className="flex flex-1 flex-col px-5 py-10 sm:px-8 sm:py-16 lg:justify-center lg:px-16 lg:py-10">
          <div className="mx-auto w-full max-w-[420px]">
            <div className="animate-in">
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-navy">{title}</h1>
              <p className="mt-2 text-[15px] text-slate-blue">{subtitle}</p>
            </div>
            <div className="animate-in mt-8" style={{ ["--i" as string]: 1 }}>
              {children}
            </div>
            <div className="animate-in mt-8 text-center text-sm text-slate-blue" style={{ ["--i" as string]: 2 }}>
              {footer}
            </div>
          </div>
        </div>
        {/* Phones and tablets: the brand story, short, after the form. */}
        <section aria-label="Why Food Expiry Reminder" className="border-t border-line bg-ice px-5 py-8 sm:px-8 sm:py-12 lg:hidden">
          {/* Tablets have the room for the story and the list preview too. */}
          <div className="mx-auto hidden max-w-2xl grid-cols-2 items-center gap-8 sm:grid">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-royal">Less waste, every week</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-navy">Know what to eat first, before it goes off.</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-blue">One sorted list for your home, with a nudge before milk, bread or curd is wasted.</p>
            </div>
            <ListPreview />
          </div>
          <ul className="mx-auto grid max-w-[420px] gap-5 sm:mt-10 sm:max-w-2xl sm:grid-cols-3 sm:border-t sm:border-line sm:pt-8">
            {POINTS.map(({ Icon, title: t, text }) => (
              <li key={t} className="flex gap-3 sm:block">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white">
                  <Icon aria-hidden className="size-4 text-royal" />
                </span>
                <span className="sm:mt-3 sm:block">
                  <span className="block text-sm font-semibold text-navy">{t}</span>
                  <span className="block text-xs leading-relaxed text-slate-blue">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <footer className="flex items-center justify-between gap-4 px-5 py-5 text-xs text-slate-blue sm:px-8 lg:px-16">
          <span className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-royal" />
            Your list is private to you and your household.
          </span>
          <Link href="/privacy" className="hover:text-royal hover:underline">Privacy</Link>
        </footer>
      </main>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
