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
import { DownloadIcon, MapPinIcon } from "@/components/icons";
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
            className="cursor-pointer flex items-center gap-2 rounded-field border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
          >
            <DownloadIcon className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>

        {/* Cabeçalho de tabela só faz sentido quando há colunas: no mobile
            cada dia vira um cartão empilhado. */}
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="hidden gap-3 border-b border-line bg-surface-raised px-4.5 py-3 text-[11.5px] font-semibold tracking-wider text-ink-muted uppercase sm:grid sm:grid-cols-[110px_1fr_92px_128px]">
            <div>Data</div>
            <div>Eventos</div>
            <div>Total</div>
            <div>Status</div>
          </div>
          {filtered.length === 0 && (
            <div className="px-4.5 py-10 text-center text-sm text-ink-faint">
              Nenhum registro no período.
            </div>
          )}
          {filtered.map((r) => (
            <div
              key={r.date}
              className="flex flex-col gap-2 border-b border-line px-4.5 py-3.5 last:border-0 sm:grid sm:grid-cols-[110px_1fr_92px_128px] sm:items-center sm:gap-3"
            >
              <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0">
                <span className="text-[13.5px] font-medium">
                  {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
                </span>
                <span className="text-[11.5px] text-ink-faint">{r.weekday}</span>
                <span className="tnum ml-auto text-[13.5px] font-medium sm:hidden">
                  {r.total}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="tnum text-[13px] text-ink-soft">{r.times}</span>
                <span className="text-[11.5px] text-ink-faint">{r.sector}</span>
              </div>
              <div className="tnum hidden text-[13.5px] sm:block">{r.total}</div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
                <Badge tone={r.tone}>{r.status}</Badge>
                {r.geoCount > 0 && (
                  <button
                    onClick={() => setMapDay(r)}
                    aria-label={`Ver no mapa as ${r.geoCount} batidas de ${r.date.slice(8, 10)}/${r.date.slice(5, 7)}`}
                    className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[11.5px] font-medium text-brand-700 hover:bg-brand-50"
                  >
                    <MapPinIcon className="h-3.5 w-3.5" />
                    mapa ({r.geoCount})
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {justifications.length > 0 && (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4.5 shadow-card">
            <span className="text-[12.5px] font-semibold tracking-wide text-ink-muted uppercase">
              Minhas justificativas
            </span>
            {justifications.map((j) => (
              <div
                key={j.id}
                className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium">{j.reason}</span>
                  <span className="text-[11.5px] text-ink-faint">
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
