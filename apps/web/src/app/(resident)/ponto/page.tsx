import { createClient } from "@/lib/supabase/server";
import type { Resident, Sector } from "@/lib/domain";
import { PontoClient } from "./ponto-client";

export default async function PontoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: resident }, { data: sectors }] = await Promise.all([
    supabase
      .from("ponto_residents")
      .select("*")
      .eq("profile_id", user!.id)
      .single(),
    supabase
      .from("ponto_sectors")
      .select("*")
      .eq("active", true)
      .order("name"),
  ]);

  if (!resident) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
          <p className="text-[15px] font-semibold text-amber-900">
            Seu usuário ainda não tem cadastro de residente.
          </p>
          <p className="mt-2 text-sm text-amber-800">
            Fale com a administração para concluir o cadastro antes de registrar
            ponto.
          </p>
        </div>
      </main>
    );
  }

  return (
    <PontoClient
      resident={resident as Resident}
      sectors={(sectors ?? []) as Sector[]}
      userId={user!.id}
    />
  );
}
