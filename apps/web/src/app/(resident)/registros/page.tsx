import { createClient } from "@/lib/supabase/server";
import { daysAgoISO, type Justification, type TimeEntry } from "@/lib/domain";
import { RegistrosClient } from "./registros-client";

export default async function RegistrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: resident } = await supabase
    .from("ponto_residents")
    .select("id")
    .eq("profile_id", user!.id)
    .single();

  if (!resident) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-stone-500">
          Seu usuário ainda não tem cadastro de residente.
        </p>
      </main>
    );
  }

  const since = daysAgoISO(90);
  const [{ data: entries }, { data: justifications }] = await Promise.all([
    supabase
      .from("ponto_time_entries")
      .select("*, ponto_sectors(name)")
      .eq("resident_id", resident.id)
      .gte("event_datetime", since)
      .order("event_datetime", { ascending: true }),
    supabase
      .from("ponto_justifications")
      .select("*")
      .eq("resident_id", resident.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <RegistrosClient
      entries={(entries ?? []) as TimeEntry[]}
      justifications={(justifications ?? []) as Justification[]}
    />
  );
}
