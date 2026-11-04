/** Round badge with the first letters of a name. */
export function Avatar({ name, className = "size-8 text-xs" }: { name: string; className?: string }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white ${className}`}>
      {initials || "?"}
    </span>
  );
}
