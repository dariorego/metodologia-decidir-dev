import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "muted" | "danger";

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-brand-50 text-brand-700 border-brand-200"
      : tone === "warn"
        ? "bg-warn-50 text-warn-800 border-warn-300"
        : tone === "danger"
          ? "bg-danger-50 text-danger-700 border-danger-300"
          : "bg-surface-raised text-ink-muted border-line";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white active:bg-brand-800 disabled:bg-line-strong disabled:text-ink-faint",
  secondary:
    "border border-line-strong bg-surface text-ink-soft active:bg-surface-raised disabled:border-line disabled:bg-surface-raised disabled:text-ink-faint",
  ghost: "text-ink-muted active:bg-surface-raised disabled:text-ink-faint",
};

export function Button({
  variant = "primary",
  full = false,
  icon,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  full?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...props}
      // min-h-[52px]: alvo generoso, uso com uma mão e luva.
      className={`inline-flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-field px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Toast({ message, tone = "ok" }: { message: string | null; tone?: Tone }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="safe-bottom pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {message && (
        <div
          className={`animate-toast-in flex max-w-full items-center gap-2.5 rounded-full px-4 py-3 text-[13.5px] leading-snug shadow-raised ${
            tone === "warn" || tone === "danger"
              ? "bg-warn-700 text-white"
              : "bg-ink text-white"
          }`}
        >
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`animate-spin-slow inline-block rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
