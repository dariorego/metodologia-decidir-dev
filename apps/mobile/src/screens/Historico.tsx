import { useState } from "react";
import {
  TZ,
  fmtMin,
  groupByDay,
  hasCoords,
  localDate,
  localTime,
  workedMinutes,
  type TimeEntry,
} from "../lib/domain";
import { Badge, Card } from "../components/ui";
import { MapPinIcon } from "../components/icons";
import { PunchMap } from "../components/PunchMap";

export function Historico({ entries }: { entries: TimeEntry[] }) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const now = new Date();
  const today = localDate(now);
  const byDay = groupByDay(entries);
  const days = [...byDay.keys()].sort().reverse();

  const monthPrefix = today.slice(0, 7);
  let monthWorked = 0;
  let shifts = 0;
  for (const d of days) {
    if (!d.startsWith(monthPrefix)) continue;
    const evs = byDay.get(d)!;
    monthWorked += workedMinutes(evs, d === today ? now : undefined);
    if (evs.some((e) => e.event_type === "clock_in")) shifts += 1;
  }

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-1 px-4 py-3.5">
          <span className="text-[12px] text-ink-muted">Horas no mês</span>
          <span className="tnum text-[22px] font-semibold tracking-tight">
            {fmtMin(monthWorked)}
          </span>
        </Card>
        <Card className="flex flex-col gap-1 px-4 py-3.5">
          <span className="text-[12px] text-ink-muted">Plantões</span>
          <span className="tnum text-[22px] font-semibold tracking-tight">{shifts}</span>
        </Card>
      </div>

      {days.length === 0 && (
        <Card className="px-4 py-10 text-center text-[13px] text-ink-faint">
          Nenhuma jornada registrada ainda.
        </Card>
      )}

      {days.map((day) => {
        const evs = byDay.get(day)!;
        const isToday = day === today;
        const hasIn = evs.some((e) => e.event_type === "clock_in");
        const hasOut = evs.some((e) => e.event_type === "clock_out");
        const worked = workedMinutes(evs, isToday ? now : undefined);
        const geo = evs.filter(hasCoords).length;
        const open = openDay === day;

        const status = isToday && !hasOut
          ? { label: "Em curso", tone: "muted" as const }
          : !hasOut && hasIn
            ? { label: "Sem saída", tone: "warn" as const }
            : { label: "Consolidado", tone: "ok" as const };

        return (
          <Card key={day} className="flex flex-col">
            <button
              onClick={() => setOpenDay(open ? null : day)}
              className="flex min-h-[64px] items-center gap-3 px-4 py-3 text-left"
            >
              <div className="flex flex-col">
                <span className="text-[15px] font-semibold">
                  {day.slice(8, 10)}/{day.slice(5, 7)}
                </span>
                <span className="text-[11.5px] text-ink-faint capitalize">
                  {new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                    timeZone: TZ,
                    weekday: "short",
                  })}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="tnum truncate text-[12.5px] text-ink-soft">
                  {evs.map((e) => localTime(e.event_datetime)).join(" · ")}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <span className="tnum flex-none text-[14px] font-semibold">
                {fmtMin(worked)}
              </span>
            </button>

            {open && (
              <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5">
                {evs.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3">
                    <span className="text-[13px]">
                      {e.event_type === "clock_in"
                        ? "Entrada"
                        : e.event_type === "clock_out"
                          ? "Saída"
                          : e.event_type === "break_start"
                            ? "Início do intervalo"
                            : "Fim do intervalo"}
                    </span>
                    <span className="tnum text-[13px] font-medium">
                      {localTime(e.event_datetime)}
                    </span>
                  </div>
                ))}
                {geo > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                      <MapPinIcon className="h-3.5 w-3.5" />
                      {geo} {geo === 1 ? "localização" : "localizações"}
                    </div>
                    <PunchMap
                      entries={evs}
                      className="h-[200px] w-full overflow-hidden rounded-field border border-line"
                    />
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
