"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TZ,
  downloadCSV,
  fmtMin,
  groupByDay,
  localDate,
  localTime,
  workedMinutes,
  type Resident,
  type Sector,
  type TimeEntry,
} from "@/lib/domain";
import { StatCard, inputCls } from "@/components/ui";

type Period = "this" | "prev" | "90";

function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const today = localDate(now);
  if (p === "90") {
    return { from: localDate(new Date(now.getTime() - 90 * 86400000)), to: today };
  }
  const y = now.getFullYear();
  const m = now.getMonth() + (p === "prev" ? -1 : 0);
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return { from: localDate(first), to: p === "this" ? today : localDate(last) };
}

export default function RelatoriosPage() {
  const supabase = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState<Period>("this");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  const range = periodRange(period);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, r, s] = await Promise.all([
      supabase
        .from("ponto_time_entries")
        .select("*")
        .gte("event_datetime", `${range.from}T00:00:00-03:00`)
        .lte("event_datetime", `${range.to}T23:59:59-03:00`)
        .order("event_datetime", { ascending: true }),
      supabase
        .from("ponto_residents")
        .select("*, ponto_profiles(id, full_name, role)"),
      supabase.from("ponto_sectors").select("*"),
    ]);
    setEntries((e.data ?? []) as TimeEntry[]);
    setResidents((r.data ?? []) as Resident[]);
    setSectors((s.data ?? []) as Sector[]);
    setLoading(false);
  }, [supabase, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const report = useMemo(() => {
    const residentName = new Map(
      residents.map((r) => [r.id, r.ponto_profiles?.full_name ?? r.registration_number])
    );
    const sectorName = new Map(sectors.map((s) => [s.id, s.name]));
    const activeCount = residents.filter((r) => r.status === "active").length;

    // Por residente e dia
    const byResident = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      if (!byResident.has(e.resident_id)) byResident.set(e.resident_id, []);
      byResident.get(e.resident_id)!.push(e);
    }

    const rows: { resident: string; date: string; events: string; sector: string; minutes: number; status: string }[] = [];
    const minutesByDay = new Map<string, number>();
    const minutesBySector = new Map<string, number>();
    const presentByDay = new Map<string, Set<string>>();
    let totalMinutes = 0;
    let openShifts = 0;
    let manualCount = 0;
    const today = localDate(new Date());

    for (const [rid, list] of byResident) {
      const days = groupByDay(list);
      for (const [day, evs] of days) {
        const hasIn = evs.some((x) => x.event_type === "clock_in");
        const hasOut = evs.some((x) => x.event_type === "clock_out");
        const manual = evs.filter((x) => x.origin === "manual").length;
        const minutes = workedMinutes(evs, day === today ? new Date() : undefined);
        totalMinutes += minutes;
        manualCount += manual;
        if (hasIn && !hasOut && day !== today) openShifts += 1;
        minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + minutes);
        const sec = sectorName.get(evs[0].sector_id) ?? "—";
        minutesBySector.set(sec, (minutesBySector.get(sec) ?? 0) + minutes);
        if (hasIn) {
          if (!presentByDay.has(day)) presentByDay.set(day, new Set());
          presentByDay.get(day)!.add(rid);
        }
        rows.push({
          resident: residentName.get(rid) ?? rid,
          date: day,
          events: evs.map((x) => localTime(x.event_datetime)).join(" · "),
          sector: sec,
          minutes,
          status: !hasOut && day !== today ? "Sem saída" : manual ? "Ajuste manual" : "Consolidado",
        });
      }
    }

    // Presença média: residentes com jornada / ativos, por dia com movimento
    const daysWithMovement = [...presentByDay.values()];
    const presence =
      daysWithMovement.length && activeCount
        ? Math.round(
            (daysWithMovement.reduce((a, s) => a + s.size, 0) /
              (daysWithMovement.length * activeCount)) *
              1000
          ) / 10
        : 0;

    // Últimos 14 dias do período
    const bars: { day: string; minutes: number }[] = [];
    const end = new Date(`${range.to}T12:00:00-03:00`);
    for (let i = 13; i >= 0; i--) {
      const d = localDate(new Date(end.getTime() - i * 86400000));
      if (d < range.from) continue;
      bars.push({ day: d.slice(8, 10), minutes: minutesByDay.get(d) ?? 0 });
    }
    const maxBar = Math.max(1, ...bars.map((b) => b.minutes));

    const sectorStats = [...minutesBySector.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const maxSector = Math.max(1, ...sectorStats.map((s) => s[1]));

    rows.sort((a, b) => (a.date === b.date ? a.resident.localeCompare(b.resident) : b.date.localeCompare(a.date)));

    return { rows, totalMinutes, presence, openShifts, manualCount, bars, maxBar, sectorStats, maxSector, activeCount };
  }, [entries, residents, sectors, range.from, range.to]);

  function exportCsv() {
    downloadCSV(`relatorio-${range.from}_${range.to}.csv`, [
      ["Residente", "Data", "Eventos", "Setor", "Horas", "Status"],
      ...report.rows.map((r) => [
        r.resident,
        r.date.split("-").reverse().join("/"),
        r.events,
        r.sector,
        fmtMin(r.minutes),
        r.status,
      ]),
    ]);
  }

  const fmtDate = (d: string) =>
    new Date(`${d}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: TZ });

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[23px] font-semibold tracking-tight">Relatórios</h1>
          <p className="text-[13.5px] text-ink-muted">
            Consolidação diária · período de {fmtDate(range.from)} a{" "}
            {fmtDate(range.to)}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className={inputCls}
          >
            <option value="this">Mês atual</option>
            <option value="prev">Mês anterior</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <button
            onClick={exportCsv}
            className="cursor-pointer rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
          >
            CSV
          </button>
          <button
            onClick={() => window.print()}
            className="cursor-pointer rounded-[10px] bg-brand-700 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-800"
          >
            PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Horas consolidadas"
          value={fmtMin(report.totalMinutes)}
          hint={`${report.activeCount} residentes ativos`}
        />
        <StatCard
          label="Presença média"
          value={`${report.presence.toLocaleString("pt-BR")}%`}
          hint="residentes com jornada / ativos"
        />
        <StatCard
          label="Jornadas sem saída"
          value={report.openShifts}
          hint="no período"
          warn={report.openShifts > 0}
        />
        <StatCard
          label="Ajustes manuais"
          value={report.manualCount}
          hint={`${entries.length ? ((report.manualCount / entries.length) * 100).toFixed(1).replace(".", ",") : "0"}% dos registros`}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[14.5px] font-semibold">Horas por dia</span>
            <span className="text-xs text-ink-faint">últimos 14 dias do período</span>
          </div>
          <div className="flex h-[170px] items-end gap-2">
            {report.bars.map((b, i) => (
              <div
                key={b.day}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              >
                <div
                  className={`w-full rounded-t-[5px] ${
                    i === report.bars.length - 1 ? "bg-brand-700" : "bg-brand-200"
                  }`}
                  style={{ height: `${Math.round((b.minutes / report.maxBar) * 100)}%` }}
                  title={fmtMin(b.minutes)}
                />
                <span className="text-[10.5px] text-ink-faint">{b.day}</span>
              </div>
            ))}
            {report.bars.length === 0 && (
              <span className="text-sm text-ink-faint">Sem dados no período.</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4.5">
            <span className="text-[12.5px] font-semibold tracking-wide text-ink-muted uppercase">
              Por setor
            </span>
            {report.sectorStats.length === 0 && (
              <span className="text-[13px] text-ink-faint">Sem dados.</span>
            )}
            {report.sectorStats.map(([name, minutes]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-soft">{name}</span>
                  <span className="font-medium">{fmtMin(minutes)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-brand-700"
                    style={{ width: `${Math.round((minutes / report.maxSector) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
        <div className="grid min-w-[720px] grid-cols-[1.4fr_100px_1.4fr_1fr_90px_120px] gap-3 border-b border-line bg-surface-raised px-4.5 py-3 text-[11.5px] font-semibold tracking-wider text-ink-muted uppercase">
          <div>Residente</div>
          <div>Data</div>
          <div>Eventos</div>
          <div>Setor</div>
          <div>Horas</div>
          <div>Status</div>
        </div>
        {loading && (
          <div className="px-4.5 py-8 text-center text-sm text-ink-faint">Carregando…</div>
        )}
        {!loading && report.rows.length === 0 && (
          <div className="px-4.5 py-8 text-center text-sm text-ink-faint">
            Nenhum registro no período.
          </div>
        )}
        {report.rows.slice(0, 200).map((r, i) => (
          <div
            key={`${r.resident}-${r.date}-${i}`}
            className="grid min-w-[720px] grid-cols-[1.4fr_100px_1.4fr_1fr_90px_120px] items-center gap-3 border-b border-line px-4.5 py-2.5 text-[13px]"
          >
            <div className="truncate font-medium">{r.resident}</div>
            <div className="tabular-nums">{r.date.split("-").reverse().join("/")}</div>
            <div className="text-ink-soft tabular-nums">{r.events}</div>
            <div className="text-ink-muted">{r.sector}</div>
            <div className="tabular-nums">{fmtMin(r.minutes)}</div>
            <div className={r.status === "Sem saída" ? "text-warn-700" : "text-ink-muted"}>
              {r.status}
            </div>
          </div>
        ))}
        {report.rows.length > 200 && (
          <div className="px-4.5 py-3 text-center text-xs text-ink-faint">
            Mostrando 200 de {report.rows.length} linhas — use o CSV para o relatório completo.
          </div>
        )}
      </div>
    </div>
  );
}
