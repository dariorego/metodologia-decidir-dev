"use client";

import { initials } from "@/lib/domain";
import { CheckIcon } from "@/components/icons";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[13px] font-bold ${
          dark ? "bg-brand-50 text-brand-700" : "bg-brand-700 text-white"
        }`}
      >
        P
      </div>
      <span className="text-[14.5px] font-semibold tracking-tight">
        Ponto Residentes
      </span>
    </div>
  );
}

type Tone = "ok" | "warn" | "muted";

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-brand-50 text-brand-700 border-brand-200"
      : tone === "warn"
        ? "bg-warn-50 text-warn-800 border-warn-300"
        : "bg-surface-raised text-ink-muted border-line";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, tone = "ok" }: { name: string; tone?: Tone }) {
  const cls =
    tone === "warn"
      ? "bg-warn-50 text-warn-800"
      : tone === "muted"
        ? "bg-surface-raised text-ink-muted"
        : "bg-brand-100 text-brand-700";
  return (
    <div
      className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11.5px] font-semibold ${cls}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-card border p-4 ${
        warn ? "border-warn-300 bg-warn-50" : "border-line bg-surface shadow-card"
      }`}
    >
      <div className={`text-xs ${warn ? "text-warn-800" : "text-ink-muted"}`}>
        {label}
      </div>
      <div
        className={`tnum text-[26px] leading-tight font-semibold tracking-tight ${
          warn ? "text-warn-900" : ""
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className={`text-[11.5px] ${warn ? "text-warn-700" : "text-ink-faint"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors ${
        active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-line bg-surface text-ink-soft hover:border-brand-700 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------
   Button — primitivo com variantes, no lugar de strings de classe
   repetidas tela a tela. Mantém altura, foco e estados consistentes.
   ------------------------------------------------------------------ */
type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-line-strong disabled:text-ink-faint",
  secondary:
    "border border-line-strong bg-surface text-ink-soft hover:border-brand-700 hover:text-brand-700 disabled:border-line disabled:bg-surface-raised disabled:text-ink-faint disabled:hover:border-line disabled:hover:text-ink-faint",
  ghost:
    "text-ink-muted hover:bg-surface-raised disabled:text-ink-faint disabled:hover:bg-transparent",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-[13px]",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3.5 text-[14.5px]",
};

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  icon,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-field font-medium transition-colors disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${full ? "w-full" : ""} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Campo com <label> ligado ao controle por id — exigência de acessibilidade. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && <span className="text-[11.5px] text-ink-faint">{hint}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-4 py-8 text-center">
      <span className="text-sm font-medium text-ink-soft">{title}</span>
      {description && (
        <span className="max-w-[320px] text-[13px] leading-relaxed text-ink-faint">
          {description}
        </span>
      )}
      {action}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  // role="status" + aria-live: o leitor de tela anuncia a confirmação da
  // batida. O contêiner fica sempre no DOM para que a mudança seja notada.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-7 z-40 flex justify-center px-4"
    >
      {message && (
        <div className="animate-toast-in flex items-center gap-2.5 rounded-full bg-ink px-4.5 py-3 text-[13.5px] text-white shadow-raised">
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-brand-300 text-brand-900">
            <CheckIcon className="h-3 w-3" />
          </span>
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

export const inputCls =
  "w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-700";
export const labelCls = "text-[12.5px] font-semibold text-ink-soft";
export const btnPrimary =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-field bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-line-strong";
export const btnGhost =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-field border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700";
