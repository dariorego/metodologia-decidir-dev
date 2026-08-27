import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  daysAgoISO,
  findOpenShift,
  type Resident,
  type TimeEntry,
} from "@/lib/domain";
import { JustificarClient } from "./justificar-client";

export default async function JustificarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: resident } = await supabase
    .from("ponto_residents")
    .select("*")
    .eq("profile_id", user!.id)
    .single();

  if (!resident) redirect("/ponto");

  const since = daysAgoISO(14);
  const [{ data: entries }, { data: justs }] = await Promise.all([
    supabase
      .from("ponto_time_entries")
      .select("*, ponto_sectors(name)")
      .eq("resident_id", resident.id)
      .gte("event_datetime", since)
      .order("event_datetime", { ascending: true }),
    supabase
      .from("ponto_justifications")
      .select("related_time_entry_id")
      .eq("resident_id", resident.id)
      .not("related_time_entry_id", "is", null),
  ]);

  const openShift = findOpenShift(
    (entries ?? []) as TimeEntry[],
    new Set((justs ?? []).map((j) => j.related_time_entry_id as string))
  );
  if (!openShift) redirect("/ponto");

  return (
    <JustificarClient
      resident={resident as Resident}
      openShift={openShift}
      userId={user!.id}
    />
  );
}
