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
    <header className="sticky top-0 z-5 flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3.5">
      <Link href="/ponto">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        {pathname !== "/registros" ? (
          <Link
            href="/registros"
            className="rounded-[9px] border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:border-teal-700 hover:text-teal-700"
          >
            Meus registros
          </Link>
        ) : (
          <Link
            href="/ponto"
            className="rounded-[9px] border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:border-teal-700 hover:text-teal-700"
          >
            ← Ponto
          </Link>
        )}
        <button
          onClick={logout}
          className="cursor-pointer rounded-[9px] px-3 py-2 text-[13px] text-stone-500 transition-colors hover:bg-stone-100"
        >
          Sair
        </button>
        <div className="flex items-center gap-2 border-l border-stone-200 pl-2.5">
          <Avatar name={name} />
          <span className="hidden text-[13px] text-stone-700 sm:block">{name}</span>
        </div>
      </div>
    </header>
  );
}
