import {
  EVENT_LABEL,
  hasCoords,
  localDateBR,
  localTime,
  type TimeEntry,
} from "../lib/domain";
import { EVENT_COLOR, PunchMap, fmtCoord } from "../components/PunchMap";
import { Card } from "../components/ui";

/**
 * "Mapa das Batidas": marcadores de todas as batidas do dia.
 * A lista abaixo repete os dados do popup, porque tocar um marcador
 * pequeno no celular é impreciso.
 */
export function Mapa({ entries }: { entries: TimeEntry[] }) {
  const today = new Date();
  const pts = entries.filter(hasCoords);

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6">
      <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">Mapa das batidas</span>
          <span className="text-[12.5px] text-ink-muted">
            {localDateBR(today)} · {pts.length}{" "}
            {pts.length === 1 ? "localização" : "localizações"}
          </span>
        </div>
      </Card>

      <PunchMap
        entries={entries}
        className="h-[46vh] min-h-[280px] w-full overflow-hidden rounded-card border border-line"
      />

      <Card className="flex flex-col gap-3 px-4 py-4">
        <span className="text-[14px] font-semibold">Detalhe das batidas</span>
        {pts.length === 0 ? (
          <span className="py-4 text-center text-[13px] text-ink-faint">
            Nenhuma batida com localização hoje.
          </span>
        ) : (
          pts.map((e, i) => (
            <div key={e.id} className="flex items-start gap-3">
              <span
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11.5px] font-bold text-white"
                style={{ background: EVENT_COLOR[e.event_type] }}
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13.5px] font-medium">
                  {EVENT_LABEL[e.event_type]}
                </span>
                <span className="tnum text-[11.5px] text-ink-faint">
                  {localTime(e.event_datetime)} · {fmtCoord(e.latitude, e.longitude)}
                </span>
                <span className="truncate text-[11.5px] text-ink-faint">
                  {e.ponto_sectors?.name ?? ""}
                  {e.is_offline ? " · registrada offline" : ""}
                </span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
