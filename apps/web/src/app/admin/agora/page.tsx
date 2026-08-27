"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  TZ,
  downloadCSV,
  findOpenShift,
  fmtMin,
  localTime,
  type Sector,
  type TimeEntry,
} from "@/lib/domain";
import { Avatar, Badge, Pill, StatCard } from "@/components/ui";

interface PresentRow {
  resident_id: string;
  full_name: string;
  registration_number: string;
  program: string | null;
  sector_id: string;
  sector_name: string;
  event_type: string;
  event_datetime: string;
  first_in_datetime: string | null;
}

export default function AgoraPage() {
  const supabase = useMemo(() => createClient(), []);
  const [present, setPresent] = useState<PresentRow[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [openShiftCount, setOpenShiftCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [presentRes, sectorsRes, activeRes, pendingRes, entriesRes, justsRes] =
      await Promise.all([
        supabase
          .from("ponto_v_currently_present")
          .select("*")
          .order("full_name"),
        supabase.from("ponto_sectors").select("*").eq("active", true).order("name"),
        supabase
          .from("ponto_residents")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("ponto_justifications")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("ponto_time_entries")
          .select("id, resident_id, event_type, event_datetime, sector_id, origin, latitude, longitude, justification_id, created_by")
          .gte("event_datetime", since)
          .in("event_type", ["clock_in", "clock_out"])
          .order("event_datetime", { ascending: true }),
        supabase
          .from("ponto_justifications")
          .select("related_time_entry_id")
          .not("related_time_entry_id", "is", null),
      ]);
    const justified = new Set(
      (justsRes.data ?? []).map((j) => j.related_time_entry_id as string)
    );

    setPresent((presentRes.data ?? []) as PresentRow[]);
    setSectors((sectorsRes.data ?? []) as Sector[]);
    setActiveCount(activeRes.count ?? 0);
    setPendingCount(pendingRes.count ?? 0);

    // Jornadas de dias anteriores sem clock_out, por residente
    const byResident = new Map<string, TimeEntry[]>();
    for (const e of (entriesRes.data ?? []) as TimeEntry[]) {
      if (!byResident.has(e.resident_id)) byResident.set(e.resident_id, []);
      byResident.get(e.resident_id)!.push(e);
    }
    let open = 0;
    for (const list of byResident.values()) {
      if (findOpenShift(list, justified)) open += 1;
    }
    setOpenShiftCount(open);
    setUpdatedAt(new Date().toLocaleTimeString("pt-BR", { timeZone: TZ }));
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("presence-time-entries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ponto_time_entries" },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const breakCount = present.filter((p) => p.event_type === "break_start").length;

  const filtered = present.filter((p) => {
    if (sectorFilter !== "all" && p.sector_id !== sectorFilter) return false;
    if (
      search &&
      !`${p.full_name} ${p.registration_number}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  function elapsed(p: PresentRow): number {
    const start = p.first_in_datetime ?? p.event_datetime;
    return Math.round((Date.now() - new Date(start).getTime()) / 60000);
  }

  function statusOf(p: PresentRow): { label: string; tone: "ok" | "warn" | "muted" } {
    if (p.event_type === "break_start") return { label: "Em intervalo", tone: "muted" };
    if (elapsed(p) > 12 * 60) return { label: "Jornada longa", tone: "warn" };
    return { label: "Na instituição", tone: "ok" };
  }

  function exportCsv() {
    downloadCSV("presenca-agora.csv", [
      ["Residente", "Matrícula", "Programa", "Setor", "Desde", "Nesta jornada", "Status"],
      ...filtered.map((p) => [
        p.full_name,
        p.registration_number,
        p.program ?? "",
        p.sector_name,
        localTime(p.first_in_datetime ?? p.event_datetime),
        fmtMin(elapsed(p)),
        statusOf(p).label,
      ]),
    ]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[23px] font-semibold tracking-tight">
            Quem está na instituição
          </h1>
          <p className="text-[13.5px] text-ink-muted">
            {updatedAt ? `Atualizado às ${updatedAt}` : "Carregando…"} · painel em
            tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/ajuste"
            className="rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
          >
            Inserir ponto manual
          </Link>
          <button
            onClick={exportCsv}
            className="cursor-pointer rounded-[10px] bg-brand-700 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-800"
          >
            Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Na instituição"
          value={present.length}
          hint={`de ${activeCount} residentes ativos`}
        />
        <StatCard label="Em intervalo" value={breakCount} hint="agora" />
        <StatCard
          label="Pontos não finalizados"
          value={openShiftCount}
          hint="aguardando justificativa"
          warn={openShiftCount > 0}
        />
        <StatCard
          label="Ajustes a aprovar"
          value={pendingCount}
          hint="fila de aprovações"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill active={sectorFilter === "all"} onClick={() => setSectorFilter("all")}>
          Todos os setores
        </Pill>
        {sectors.map((s) => (
          <Pill
            key={s.id}
            active={sectorFilter === s.id}
            onClick={() => setSectorFilter(s.id)}
          >
            {s.name}
          </Pill>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar residente"
          className="ml-auto w-[190px] rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand-700"
        />
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
        <div className="grid min-w-[640px] grid-cols-[1.5fr_1fr_100px_110px_140px] gap-3 border-b border-line bg-surface-raised px-4.5 py-3 text-[11.5px] font-semibold tracking-wider text-ink-muted uppercase">
          <div>Residente</div>
          <div>Setor</div>
          <div>Desde</div>
          <div>Nesta jornada</div>
          <div>Status</div>
        </div>
        {filtered.length === 0 && (
          <div className="px-4.5 py-10 text-center text-sm text-ink-faint">
            Ninguém na instituição com os filtros atuais.
          </div>
        )}
        {filtered.map((p) => {
          const st = statusOf(p);
          return (
            <div
              key={p.resident_id}
              className="grid min-w-[640px] grid-cols-[1.5fr_1fr_100px_110px_140px] items-center gap-3 border-b border-line px-4.5 py-3"
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={p.full_name} tone={st.tone} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-medium">
                    {p.full_name}
                  </span>
                  <span className="text-[11.5px] text-ink-faint">
                    {p.program ?? p.registration_number}
                  </span>
                </div>
              </div>
              <div className="text-[13px] text-ink-soft">{p.sector_name}</div>
              <div className="text-[13px] text-ink-soft tabular-nums">
                {localTime(p.first_in_datetime ?? p.event_datetime)}
              </div>
              <div className="text-[13px] text-ink-soft tabular-nums">
                {fmtMin(elapsed(p))}
              </div>
              <div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
