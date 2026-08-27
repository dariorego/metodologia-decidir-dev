"use client";

import { initials } from "@/lib/domain";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[13px] font-bold ${
          dark ? "bg-teal-50 text-teal-700" : "bg-teal-700 text-white"
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

export function Badge({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-teal-50 text-teal-700 border-teal-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-300"
        : "bg-stone-50 text-stone-500 border-stone-200";
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, tone = "ok" }: { name: string; tone?: Tone }) {
  const cls =
    tone === "warn"
      ? "bg-amber-100 text-amber-800"
      : tone === "muted"
        ? "bg-stone-100 text-stone-500"
        : "bg-teal-100 text-teal-700";
  return (
    <div
      className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11.5px] font-semibold ${cls}`}
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
      className={`flex flex-col gap-1 rounded-[13px] border p-4 ${
        warn ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
      }`}
    >
      <div className={`text-xs ${warn ? "text-amber-800" : "text-stone-500"}`}>{label}</div>
      <div
        className={`text-[26px] font-semibold tracking-tight ${warn ? "text-amber-900" : ""}`}
      >
        {value}
      </div>
      {hint && (
        <div className={`text-[11.5px] ${warn ? "text-amber-700" : "text-stone-400"}`}>{hint}</div>
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
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors ${
        active
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-stone-200 bg-white text-stone-600 hover:border-teal-700 hover:text-teal-700"
      }`}
    >
      {children}
    </button>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="animate-toast-in fixed bottom-7 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2.5 rounded-full bg-stone-900 px-4.5 py-3 text-[13.5px] text-stone-50 shadow-xl shadow-stone-900/25">
        <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full bg-teal-300 text-[11px] font-bold text-teal-900">
          ✓
        </span>
        <span>{message}</span>
      </div>
    </div>
  );
}

export const inputCls =
  "rounded-[10px] border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700";
export const labelCls = "text-[12.5px] font-semibold text-stone-700";
export const btnPrimary =
  "cursor-pointer rounded-[10px] bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300";
export const btnGhost =
  "cursor-pointer rounded-[10px] border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100";
