"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Logo } from "@/components/ui";

export function ResidentHeader({ name }: { name: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-5 flex items-center justify-between border-b border-line bg-surface px-6 py-3.5">
      <Link href="/ponto">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        {pathname !== "/registros" ? (
          <Link
            href="/registros"
            className="rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
          >
            Meus registros
          </Link>
        ) : (
          <Link
            href="/ponto"
            className="rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
          >
            ← Ponto
          </Link>
        )}
        <button
          onClick={logout}
          className="cursor-pointer rounded-[9px] px-3 py-2 text-[13px] text-ink-muted transition-colors hover:bg-surface-raised"
        >
          Sair
        </button>
        <div className="flex items-center gap-2 border-l border-line pl-2.5">
          <Avatar name={name} />
          <span className="hidden text-[13px] text-ink-soft sm:block">{name}</span>
        </div>
      </div>
    </header>
  );
}
