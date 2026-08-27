"use client";

import { useState } from "react";
import {
  TZ,
  downloadCSV,
  fmtMin,
  groupByDay,
  hasCoords,
  localDate,
  localDateBR,
  localTime,
  workedMinutes,
  type Justification,
  type TimeEntry,
} from "@/lib/domain";
import { Badge, Pill, StatCard } from "@/components/ui";
import { PunchMapModal } from "@/components/punch-map";

type DayRow = {
  date: string;
  weekday: string;
  times: string;
  sector: string;
  total: string;
  status: string;
  tone: "ok" | "warn" | "muted";
  events: TimeEntry[];
  geoCount: number;
};

export function RegistrosClient({
  entries,
  justifications,
}: {
  entries: TimeEntry[];
  justifications: Justification[];
}) {
  const [now] = useState(() => new Date());
  const thisMonth = localDate(now).slice(0, 7);
  const prevMonth = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 15)).slice(0, 7);
  const [filter, setFilter] = useState<string>(thisMonth);
  const [mapDay, setMapDay] = useState<DayRow | null>(null);

  const pendingCount = justifications.filter((j) => j.status === "pending").length;

  const { rows, monthWorked, shifts, manualCount } = (() => {
    const byDay = groupByDay(entries);
    const today = localDate(now);
    const rows: DayRow[] = [];
    let monthWorked = 0;
    let shifts = 0;
    let manualCount = 0;

    const days = [...byDay.keys()].sort().reverse();
    for (const day of days) {
      const evs = byDay.get(day)!;
      const isToday = day === today;
      const hasOut = evs.some((e) => e.event_type === "clock_out");
      const hasIn = evs.some((e) => e.event_type === "clock_in");
      const manual = evs.some((e) => e.origin === "manual");
      const justified = evs.some((e) => e.justification_id);
      const worked = workedMinutes(evs, isToday ? now : undefined);

      if (day.startsWith(thisMonth)) {
        monthWorked += worked;
        if (hasIn) shifts += 1;
        if (manual) manualCount += 1;
      }

      let status = "Consolidado";
      let tone: DayRow["tone"] = "ok";
      if (isToday && !hasOut) {
        status = "Em curso";
        tone = "muted";
      } else if (!hasOut && hasIn) {
        status = justified ? "Justificado" : "Sem saída";
        tone = justified ? "muted" : "warn";
      } else if (manual) {
        status = "Ajuste manual";
        tone = "muted";
      }

      rows.push({
        date: day,
        weekday: new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
          timeZone: TZ,
          weekday: "long",
        }),
        times:
          evs.map((e) => localTime(e.event_datetime)).join(" · ") +
          (isToday && !hasOut ? " · …" : !hasOut ? " · —" : ""),
        sector: evs[0]?.ponto_sectors?.name ?? "",
        total: hasOut || isToday ? fmtMin(worked) : "—",
        status,
        tone,
        events: evs,
        geoCount: evs.filter(hasCoords).length,
      });
    }
    return { rows, monthWorked, shifts, manualCount };
  })();

  const filtered = rows.filter((r) => filter === "all" || r.date.startsWith(filter));

  function exportCsv() {
    downloadCSV(
      `meus-registros-${filter === "all" ? "todos" : filter}.csv`,
      [
        ["Data", "Dia", "Eventos", "Setor", "Total", "Status"],
        ...filtered.map((r) => [
          r.date.split("-").reverse().join("/"),
          r.weekday,
          r.times,
          r.sector,
          r.total,
          r.status,
        ]),
      ]
    );
  }

  const monthLabel = (m: string) =>
    new Date(`${m}-15T12:00:00-03:00`).toLocaleDateString("pt-BR", {
      timeZone: TZ,
      month: "long",
    });

  return (
    <main className="flex flex-1 justify-center px-6 pt-6 pb-16">
      <div className="flex w-full max-w-[820px] flex-col gap-4.5">
        <h1 className="text-xl font-semibold tracking-tight">Meus registros</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Horas no mês" value={fmtMin(monthWorked)} />
          <StatCard label="Plantões" value={shifts} />
          <StatCard label="Ajustes manuais" value={manualCount} />
          <StatCard
            label="Pendências"
            value={pendingCount}
            warn={pendingCount > 0}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Pill active={filter === thisMonth} onClick={() => setFilter(thisMonth)}>
              {monthLabel(thisMonth)}
            </Pill>
            <Pill active={filter === prevMonth} onClick={() => setFilter(prevMonth)}>
              {monthLabel(prevMonth)}
            </Pill>
            <Pill active={filter === "all"} onClick={() => setFilter("all")}>
              Todos
            </Pill>
          </div>
          <button
            onClick={exportCsv}
            className="cursor-pointer rounded-[9px] border border-stone-200 bg-white px-3.5 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:border-teal-700 hover:text-teal-700"
          >
            Exportar CSV
          </button>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-stone-200 bg-white">
          <div className="grid grid-cols-[110px_1fr_92px_128px] gap-3 border-b border-stone-200 bg-stone-50 px-4.5 py-3 text-[11.5px] font-semibold tracking-wider text-stone-500 uppercase">
            <div>Data</div>
            <div>Eventos</div>
            <div>Total</div>
            <div>Status</div>
          </div>
          {filtered.length === 0 && (
            <div className="px-4.5 py-8 text-center text-sm text-stone-400">
              Nenhum registro no período.
            </div>
          )}
          {filtered.map((r) => (
            <div
              key={r.date}
              className="grid grid-cols-[110px_1fr_92px_128px] items-center gap-3 border-b border-stone-100 px-4.5 py-3.5"
            >
              <div className="flex flex-col">
                <span className="text-[13.5px] font-medium">
                  {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
                </span>
                <span className="text-[11.5px] text-stone-400">{r.weekday}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-stone-700 tabular-nums">
                  {r.times}
                </span>
                <span className="text-[11.5px] text-stone-400">{r.sector}</span>
              </div>
              <div className="text-[13.5px] tabular-nums">{r.total}</div>
              <div className="flex flex-col items-start gap-1">
                <Badge tone={r.tone}>{r.status}</Badge>
                {r.geoCount > 0 && (
                  <button
                    onClick={() => setMapDay(r)}
                    title="Ver localização das batidas no mapa"
                    className="cursor-pointer rounded-md px-1 py-0.5 text-[11.5px] font-medium text-teal-700 hover:bg-teal-50"
                  >
                    📍 mapa ({r.geoCount})
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {justifications.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[14px] border border-stone-200 bg-white p-4.5">
            <span className="text-[12.5px] font-semibold tracking-wide text-stone-500 uppercase">
              Minhas justificativas
            </span>
            {justifications.map((j) => (
              <div
                key={j.id}
                className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium">{j.reason}</span>
                  <span className="text-[11.5px] text-stone-400">
                    {new Date(j.created_at).toLocaleDateString("pt-BR", { timeZone: TZ })}
                    {j.review_notes ? ` · revisão: ${j.review_notes}` : ""}
                  </span>
                </div>
                <Badge
                  tone={
                    j.status === "approved"
                      ? "ok"
                      : j.status === "pending"
                        ? "warn"
                        : "muted"
                  }
                >
                  {j.status === "approved"
                    ? "Aprovada"
                    : j.status === "pending"
                      ? "Pendente"
                      : "Reprovada"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {mapDay && (
        <PunchMapModal
          title={`Batidas de ${localDateBR(`${mapDay.date}T12:00:00-03:00`)}`}
          entries={mapDay.events}
          onClose={() => setMapDay(null)}
        />
      )}
    </main>
  );
}
