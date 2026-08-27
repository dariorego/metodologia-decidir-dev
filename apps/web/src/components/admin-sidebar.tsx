"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Logo } from "@/components/ui";

const NAV = [
  { href: "/admin/agora", label: "Agora" },
  { href: "/admin/aprovacoes", label: "Aprovações", badge: true },
  { href: "/admin/ajuste", label: "Ajuste manual" },
  { href: "/admin/residentes", label: "Residentes" },
  { href: "/admin/relatorios", label: "Relatórios" },
];

export function AdminSidebar({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let active = true;
    async function count() {
      const { count } = await supabase
        .from("ponto_justifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (active) setPending(count ?? 0);
    }
    count();
    const channel = supabase
      .channel("admin-pending")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ponto_justifications" },
        count
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, pathname]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col gap-5 border-b border-stone-200 bg-white p-4 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
      <div className="flex items-center gap-2.5 px-1.5">
        <Logo />
      </div>
      <div className="-mt-3 px-1.5 text-[11px] text-stone-400">Administração</div>

      <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
        {NAV.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-teal-50 text-teal-700"
                  : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              <span>{n.label}</span>
              {n.badge && pending > 0 && (
                <span className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-amber-700 px-1.5 text-[11px] font-semibold text-white">
                  {pending}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col gap-2.5 md:flex">
        <div className="flex flex-col gap-1 rounded-[11px] border border-stone-200 p-3">
          <span className="text-xs font-semibold text-stone-700">
            Notificações
          </span>
          <span className="text-[11.5px] leading-snug text-stone-500">
            {pending === 0
              ? "Nenhuma pendência aguardando decisão."
              : `${pending} ${pending === 1 ? "pendência" : "pendências"} · canal: painel`}
          </span>
        </div>
        <div className="flex items-center gap-2 px-1.5 py-2">
          <Avatar name={name} tone="muted" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[12.5px] font-medium">{name}</span>
            <span className="text-[11px] text-stone-400">Coordenação</span>
          </div>
          <button
            onClick={logout}
            className="ml-auto cursor-pointer rounded-lg border border-stone-200 px-2 py-1 text-[11.5px] text-stone-500 hover:bg-stone-100"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
