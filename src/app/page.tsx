import Link from "next/link";
import { Barcode, CheckCircle2, IndianRupee, ShieldCheck, Sparkles, Users, WifiOff, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { LandingAuthButtons } from "@/components/LandingAuthButtons";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ExpiryPlayground } from "@/components/landing/ExpiryPlayground";
import { Faq } from "@/components/landing/Faq";
import { Reveal } from "@/components/landing/Reveal";

const FEATURES: Array<{ Icon: LucideIcon; title: string; text: string; wide?: boolean }> = [
  {
    Icon: Sparkles,
    title: "Reads messy dates",
    text: "Dot-matrix print, curved packs, \"EXP\", \"BB\", \"Use by\", month-only dates. An AI reader handles the hard ones, with an on-device reader when you are offline.",
    wide: true,
  },
  { Icon: Users, title: "One list for the family", text: "Share a household with an invite link. Everyone sees who added what." },
  { Icon: Barcode, title: "Barcodes too", text: "Scan the barcode to fill in the product name, then just the date." },
  { Icon: WifiOff, title: "Works offline", text: "Install it to your Home Screen. Your list opens even without internet." },
  { Icon: ShieldCheck, title: "Private by design", text: "Only you and the people you invite can see your food list." },
  { Icon: IndianRupee, title: "Free", text: "No subscription, no smart fridge, no sensors. Just the phone you own.", wide: true },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <LandingNav />

      <main id="main">
        {/* Hero */}
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(60%_50%_at_20%_10%,rgba(36,87,197,0.10),transparent),radial-gradient(40%_40%_at_90%_20%,rgba(189,235,250,0.35),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
            <div className="animate-in">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
                <CheckCircle2 aria-hidden className="size-3.5" />
                No additional hardware required.
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                <span className="sr-only">Food Expiry Reminder: </span>
                Eat it <span className="text-brand-600 dark:text-brand-300">before</span> it expires.
              </h1>
              <p className="mt-5 max-w-xl text-lg muted">
                Scan the date on any pack with your phone. We keep the list and remind you before milk, bread or curd goes off, so less ends up in the bin.
              </p>
              <LandingAuthButtons />
              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                {[
                  ["2 sec", "to scan a date"],
                  ["₹0", "to use"],
                  ["1 list", "for the whole family"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="sr-only">{l}</dt>
                    <dd>
                      <span className="font-semibold">{v}</span> <span className="muted">{l}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="animate-in" style={{ ["--i" as string]: 3 }}>
              <HeroDemo />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-h" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface-2)]/60 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <SectionHead eyebrow="Four steps" id="how-h" title="How it works" text="From the shopping bag to a reminder, in under a minute." />
            </Reveal>
            <Reveal delay={100}>
              <HowItWorks />
            </Reveal>
          </div>
        </section>

        {/* Try it */}
        <section id="try" aria-labelledby="try-h" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <SectionHead eyebrow="Try it" id="try-h" title="See what the app would tell you" text="Pick a food and when it expires. This is exactly how it shows up in your list." />
            </Reveal>
            <Reveal delay={100}>
              <ExpiryPlayground />
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-h" className="scroll-mt-20 border-t border-[var(--border)] py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <SectionHead eyebrow="Features" id="features-h" title="Small app, the right details" />
            </Reveal>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ Icon, title, text, wide }, i) => (
                <li key={title} className={wide ? "sm:col-span-2" : ""}>
                  <Reveal delay={i * 60} className="h-full">
                    <div className="card card-hover group h-full p-5">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 dark:bg-brand-900/40 dark:text-brand-200">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <h3 className="mt-4 font-semibold">{title}</h3>
                      <p className="mt-1 text-sm muted">{text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-h" className="scroll-mt-20 border-t border-[var(--border)] bg-[var(--surface-2)]/60 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
            <Reveal>
              <SectionHead eyebrow="Questions" id="faq-h" title="Good to know" text="Anything else? Try the demo, it uses sample data on your device only." />
            </Reveal>
            <Reveal delay={100}>
              <Faq />
            </Reveal>
          </div>
        </section>

        {/* Final call to action */}
        <section className="py-20">
          <Reveal className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-2xl bg-brand-600 px-6 py-12 text-center text-white sm:px-12">
              <h2 className="relative text-2xl font-semibold tracking-tight sm:text-3xl">Start with the next thing you buy.</h2>
              <p className="relative mt-2 text-white/80">Free, works on the phone you already have.</p>
              <div className="relative mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/register" className="btn bg-white px-6 text-brand-800 hover:bg-brand-50 active:scale-[0.98]">
                  Create a free account
                </Link>
                <Link href="/login" className="btn border border-white/30 px-6 text-white hover:bg-white/10 active:scale-[0.98]">
                  Login
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm muted sm:flex-row sm:px-6">
          <p className="flex items-center gap-2">
            <LogoMark className="size-5" /> Food Expiry Reminder · A frugal innovation project
          </p>
          <Link href="/privacy" className="hover:text-[var(--text)]">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, id, title, text }: { eyebrow: string; id: string; title: string; text?: string }) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="text-sm font-medium text-brand-700 dark:text-brand-200">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {text && <p className="mt-3 muted">{text}</p>}
    </div>
  );
}
