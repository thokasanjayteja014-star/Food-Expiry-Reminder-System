import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "error";

const TONES: Record<Tone, { cls: string; Icon: typeof Info }> = {
  info: { cls: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100", Icon: Info },
  success: { cls: "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-100", Icon: CheckCircle2 },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100", Icon: TriangleAlert },
  error: { cls: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100", Icon: AlertCircle },
};

export function Alert({ tone = "info", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${cls} ${className}`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
