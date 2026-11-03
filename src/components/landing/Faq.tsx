import { ChevronDown } from "lucide-react";

const QA = [
  {
    q: "Do I need to install anything?",
    a: "No. It runs in the browser on your phone or laptop. You can add it to your Home Screen so it opens like an app.",
  },
  {
    q: "What if it reads the date wrong?",
    a: "You always see the date before anything is saved, and can change it in one tap. If the date is unclear, the app asks you instead of guessing.",
  },
  {
    q: "Can my family use the same list?",
    a: "Yes. Create a household and share the invite code or link. Everyone sees the same food and everyone gets the reminders.",
  },
  {
    q: "What happens to my photos?",
    a: "A scan photo is only used to read the dates. It is not kept unless you choose to save a small picture with the item.",
  },
  {
    q: "Does it cost anything?",
    a: "No. It is built on free tools and free cloud plans.",
  },
];

/** Plain details/summary accordion, so it works without JavaScript and with a keyboard. */
export function Faq() {
  return (
    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {QA.map(({ q, a }) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium transition-colors hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown aria-hidden className="size-4 shrink-0 muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-4 text-sm muted">{a}</p>
        </details>
      ))}
    </div>
  );
}
