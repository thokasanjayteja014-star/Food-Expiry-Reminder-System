import Link from "next/link";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#039855" />
      <rect x="16" y="18" width="32" height="32" rx="6" fill="#fff" />
      <rect x="16" y="18" width="32" height="9" rx="4" fill="#a6f4c5" />
      <path d="M24 38l6 6 11-13" fill="none" stroke="#039855" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="23" y="12" width="5" height="10" rx="2.5" fill="#fff" />
      <rect x="36" y="12" width="5" height="10" rx="2.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-bold tracking-tight">
      <LogoMark />
      <span>Food Expiry Reminder</span>
    </Link>
  );
}
