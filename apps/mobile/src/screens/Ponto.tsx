import { useCallback, useEffect, useState } from "react";
import {
  EVENT_ACTION,
  EVENT_LABEL,
  TZ,
  blockReason,
  breakMinutes,
  dayState,
  fmtMin,
  localDate,
  localTime,
  nextEvent,
  secondaryEvent,
  workedMinutes,
  type Resident,
  type Sector,
  type TimeEntry,
  type TimeEventType,
} from "../lib/domain";
import { GEO_MESSAGE, accuracyLabel, getCoords } from "../lib/geo";
import { newId, type PendingPunch } from "../lib/queue";
import { Badge, Button, Card } from "../components/ui";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  CoffeeIcon,
  LockIcon,
  MapPinIcon,
} from "../components/icons";

/** Estado da jornada em destaque, como pede a sprint. */
function StatusBanner({
  state,
  worked,
  breaks,
  breakMin,
}: {
  state: ReturnType<typeof dayState>;
  worked: number;
  breaks: number;
  breakMin: number;
}) {
  const { label, tone, hint } = !state.hasClockIn
    ? {
        label: "Jornada não iniciada",
        tone: "muted" as const,
        hint: "Registre a entrada para começar",
      }
    : state.hasClockOut
      ? {
          label: "Jornada encerrada",
          tone: "muted" as const,
          hint: `${fmtMin(worked)} registradas hoje`,
        }
      : state.breakOpen
        ? {
            label: "Em intervalo",
            tone: "warn" as const,
            hint: "Encerre o intervalo para continuar",
          }
        : {
            label: "Em jornada",
            tone: "ok" as const,
            hint: `${fmtMin(worked)} até agora`,
          };

  return (
    <Card
      className={`flex items-center justify-between gap-3 px-4 py-3.5 ${
        tone === "warn" ? "border-warn-300 bg-warn-50" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="truncate text-[12.5px] text-ink-muted">{hint}</span>
      </div>
      <div className="flex flex-none flex-col items-end gap-0.5">
        <span className="tnum text-[15px] font-semibold">{fmtMin(worked)}</span>
        <span className="text-[11.5px] text-ink-faint">
          {breaks === 0
            ? "sem intervalo"
            : `${breaks} int. · ${fmtMin(breakMin)}`}
        </span>
      </div>
    </Card>
  );
}

export function Ponto({
  resident,
  sectors,
  entries,
  userId,
  online,
  pendingCount,
  syncing,
  onPunch,
  onOpenMap,
  flash,
}: {
  resident: Resident;
  sectors: Sector[];
  entries: TimeEntry[];
  userId: string;
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  onPunch: (p: PendingPunch) => Promise<void>;
  onOpenMap: () => void;
  flash: (msg: string, tone?: "ok" | "warn") => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState<"geo" | "save" | null>(null);
  const [sectorId, setSectorId] = useState(
    resident.default_sector_id ?? sectors[0]?.id ?? ""
  );
  const [sheet, setSheet] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const today = localDate(new Date());
  const todayEvents = entries.filter((e) => localDate(e.event_datetime) === today);
  const state = dayState(todayEvents);
  const primary = nextEvent(todayEvents);
  const secondary = secondaryEvent(todayEvents);
  const secondaryBlock = secondary ? blockReason(secondary, todayEvents) : null;
  const sector = sectors.find((s) => s.id === sectorId);
  const sectorLocked = state.hasClockIn && !state.hasClockOut;
  const worked = workedMinutes(todayEvents, now);
  const breakMin = breakMinutes(todayEvents, now);
  const geo = accuracyLabel(lastAccuracy);

  const punch = useCallback(
    async (kind: TimeEventType) => {
      if (busy || !sectorId) {
        if (!sectorId) flash("Selecione o setor antes de registrar.", "warn");
        return;
      }
      // Regra validada no app, no banco e no trigger — os três concordam.
      const reason = blockReason(kind, todayEvents);
      if (reason) {
        flash(reason, "warn");
        return;
      }

      setBusy("geo");
      const fix = await getCoords();
      if (!fix.ok) {
        setBusy(null);
        flash(GEO_MESSAGE[fix.reason], "warn");
        return;
      }
      setLastAccuracy(fix.coords.accuracy);

      setBusy("save");
      await onPunch({
        id: newId(),
        resident_id: resident.id,
        event_type: kind,
        sector_id: sectorId,
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy: fix.coords.accuracy,
        recorded_at: new Date().toISOString(),
        created_by: userId,
        user_agent: navigator.userAgent,
        attempts: 0,
      });
      setBusy(null);
    },
    [busy, sectorId, todayEvents, resident.id, userId, onPunch, flash]
  );

  const clock = now.toLocaleTimeString("pt-BR", { timeZone: TZ });
  const dateLabel = now.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const primaryIcon =
    primary === "break_start" ? (
      <CoffeeIcon className="h-5 w-5" />
    ) : primary === "break_end" ? (
      <CheckIcon className="h-5 w-5" />
    ) : (
      <ClockIcon className="h-5 w-5" />
    );

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6">
      <StatusBanner
        state={state}
        worked={worked}
        breaks={state.breakCount}
        breakMin={breakMin}
      />

      {/* Relógio + botão principal, na metade de baixo da tela para
          alcance com o polegar de uma mão só. */}
      <Card className="flex flex-col items-center gap-4 px-4 py-6">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[12.5px] text-ink-muted capitalize">{dateLabel}</span>
          <span className="tnum text-[44px] leading-none font-semibold tracking-tighter">
            {clock}
          </span>
        </div>

        <button
          onClick={() => !sectorLocked && setSheet(true)}
          disabled={sectorLocked}
          className="flex min-h-[40px] items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 text-[13px] font-medium text-brand-700 disabled:opacity-80"
        >
          <MapPinIcon className="h-3.5 w-3.5" />
          <span>{sector?.name ?? "Selecionar setor"}</span>
          {!sectorLocked && <span className="text-brand-600">alterar</span>}
        </button>

        {primary ? (
          <button
            onClick={() => punch(primary)}
            disabled={!!busy}
            className={`flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 rounded-full bg-brand-700 text-white shadow-brand transition-transform active:scale-[0.97] disabled:opacity-75 ${
              busy ? "" : "animate-pulse-ring"
            }`}
          >
            {busy ? null : primaryIcon}
            <span className="max-w-[170px] text-[22px] leading-tight font-semibold tracking-tight">
              {busy === "geo"
                ? "Obtendo GPS…"
                : busy === "save"
                  ? "Registrando…"
                  : EVENT_ACTION[primary]}
            </span>
            <span className="px-4 text-center text-[12px] text-brand-200">
              {busy ? "aguarde" : online ? "toque para registrar" : "será salvo offline"}
            </span>
          </button>
        ) : (
          <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 rounded-full border-2 border-dashed border-line-strong bg-surface-raised text-center">
            <CheckIcon className="h-8 w-8 text-brand-700" />
            <span className="text-[19px] font-semibold text-ink-soft">
              Jornada
              <br />
              encerrada
            </span>
            <span className="tnum text-[12.5px] text-ink-faint">
              {fmtMin(worked)} registradas
            </span>
          </div>
        )}

        {secondary && (
          <div className="flex w-full flex-col items-center gap-1.5">
            <Button
              variant="secondary"
              full
              onClick={() => punch(secondary)}
              disabled={!!busy || !!secondaryBlock}
              icon={secondaryBlock ? <LockIcon className="h-4 w-4" /> : undefined}
            >
              {EVENT_ACTION[secondary]}
            </Button>
            {secondaryBlock && (
              <span className="flex items-center gap-1.5 text-center text-[12px] leading-snug text-warn-800">
                <AlertIcon className="h-3.5 w-3.5 flex-none" />
                {secondaryBlock}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone={geo.tone}>{geo.label}</Badge>
          {!online && <Badge tone="warn">Offline</Badge>}
          {pendingCount > 0 && (
            <Badge tone="warn">
              {syncing
                ? "Sincronizando…"
                : `${pendingCount} aguardando sincronização`}
            </Badge>
          )}
        </div>
      </Card>

      {/* Linha do tempo do dia */}
      <Card className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">Batidas de hoje</span>
          <button
            onClick={onOpenMap}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand-700 active:bg-brand-50"
          >
            <MapPinIcon className="h-3.5 w-3.5" />
            mapa
          </button>
        </div>

        {todayEvents.length === 0 ? (
          <div className="rounded-field border border-dashed border-line px-3 py-6 text-center text-[13px] leading-relaxed text-ink-faint">
            Nenhuma batida hoje.
            <br />O primeiro registro abre a jornada.
          </div>
        ) : (
          todayEvents.map((ev) => (
            <div key={ev.id} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{
                  background:
                    ev.event_type === "clock_in"
                      ? "#0f766e"
                      : ev.event_type === "clock_out"
                        ? "#44403c"
                        : "#b45309",
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13.5px] font-medium">
                  {EVENT_LABEL[ev.event_type]}
                </span>
                <span className="truncate text-[11.5px] text-ink-faint">
                  {ev.ponto_sectors?.name ?? ""}
                  {ev.is_offline ? " · offline" : ""}
                  {ev.id.startsWith("pending:") ? " · aguardando envio" : ""}
                </span>
              </div>
              <span className="tnum flex-none text-[13.5px] font-medium">
                {localTime(ev.event_datetime)}
              </span>
            </div>
          ))
        )}
      </Card>

      {/* Seletor de setor */}
      {sheet && (
        <div
          className="animate-fade-in fixed inset-0 z-40 flex items-end bg-ink/45"
          onClick={() => setSheet(false)}
        >
          <div
            className="safe-bottom flex max-h-[75vh] w-full flex-col gap-3 rounded-t-panel bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line-strong" />
            <span className="text-[17px] font-semibold tracking-tight">
              Onde você está?
            </span>
            <div className="flex flex-col gap-2 overflow-auto">
              {sectors.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSectorId(s.id);
                    setSheet(false);
                  }}
                  className={`flex min-h-[54px] w-full items-center gap-3 rounded-field px-4 text-left ${
                    s.id === sectorId
                      ? "border-2 border-brand-700 bg-brand-50"
                      : "border border-line bg-surface"
                  }`}
                >
                  <span
                    className={`h-3 w-3 flex-none rounded-full ${
                      s.id === sectorId ? "bg-brand-700" : "border-2 border-line-strong"
                    }`}
                  />
                  <span className="text-[15px] font-medium">{s.name}</span>
                  <span className="ml-auto text-[12px] text-ink-faint">{s.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
