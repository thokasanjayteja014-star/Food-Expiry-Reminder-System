import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  Camera,
  CheckCircle2,
  IndianRupee,
  Leaf,
  ListChecks,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { LandingAuthButtons } from "@/components/LandingAuthButtons";

const STEPS = [
  { Icon: Camera, title: "Scan", text: "Scan your food package with your phone camera." },
  { Icon: CalendarCheck, title: "Confirm", text: "Check the detected expiry date and correct it if needed." },
  { Icon: ListChecks, title: "Track", text: "See all your products and how many days each has left." },
  { Icon: Bell, title: "Get reminded", text: "Receive a notification before a product expires." },
];

const BENEFITS = [
  { Icon: Leaf, title: "Less food waste", text: "Use food before it expires instead of finding it too late at the back of the fridge." },
  { Icon: Smartphone, title: "Works in your browser", text: "No app store needed. Add it to your Home Screen to use it like an app." },
  { Icon: IndianRupee, title: "Free to run", text: "Built on free, open-source tools and free cloud tiers. ₹0 for the prototype." },
  { Icon: ShieldCheck, title: "Your data stays yours", text: "Only you, and family you invite, can see your food list. Scan photos are only used to read the dates." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <LogoMark />
          <span className="hidden sm:inline">Food Expiry Reminder</span>
        </Link>
        <nav aria-label="Account" className="flex gap-2">
          <Link href="/login" className="btn-ghost">
            Login
          </Link>
          <Link href="/register" className="btn-primary">
            Get Started
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
              <CheckCircle2 aria-hidden className="size-4" />
              No additional hardware required.
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Food Expiry Reminder</h1>
            <p className="mt-4 text-lg muted sm:text-xl">Track your food. Get reminded before it expires. Reduce food waste.</p>
            <p className="mt-4 max-w-prose muted">
              Milk, bread, curd, sauces and snacks are bought on different days and expire on different days.
              Scan the date on the pack with the phone you already own, and we will remind you before it is too late.
            </p>
            <LandingAuthButtons />
          </div>

          <div aria-hidden className="relative mx-auto w-full max-w-sm">
            <div className="card space-y-3 p-5">
              <p className="text-sm font-semibold muted">Expiring soon</p>
              {[
                ["Milk", "Expires in 2 days", "bg-soon-bg text-soon-fg", "EXPIRING SOON"],
                ["Bread", "Expires tomorrow", "bg-soon-bg text-soon-fg", "EXPIRING SOON"],
                ["Orange Juice", "Expires today", "bg-today-bg text-today-fg", "EXPIRING TODAY"],
                ["Biscuits", "39 days remaining", "bg-safe-bg text-safe-fg", "SAFE"],
              ].map(([name, days, cls, label]) => (
                <div key={name} className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm muted">{days}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${cls}`}>{label}</span>
                </div>
              ))}
            </div>
            <div className="card absolute -bottom-6 -left-4 flex items-center gap-3 p-3 shadow-lg sm:-left-10">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Bell className="size-5" />
              </span>
              <div className="text-sm">
                <p className="font-semibold">Food Expiry Reminder</p>
                <p className="muted">Milk expires in 2 days.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="border-y border-[var(--border)] bg-[var(--surface)] py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id="how" className="text-2xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ Icon, title, text }, i) => (
                <li key={title} className="card p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider muted">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="benefits" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="benefits" className="text-2xl font-bold tracking-tight">Why use it</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map(({ Icon, title, text }) => (
              <li key={title} className="card flex gap-4 p-5">
                <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-brand-600" />
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="card mt-6 flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-4">
            <WifiOff aria-hidden className="size-6 shrink-0 text-brand-600" />
            <p className="text-sm">
              <strong>No smart fridge, sensors, RFID or scanners.</strong> Your existing smartphone and laptop are enough.
              Dates are read from the pack by an AI reader, or on your device when you are offline.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-8 text-center text-sm muted">
        <p>
          Food Expiry Reminder · A frugal innovation project ·{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
