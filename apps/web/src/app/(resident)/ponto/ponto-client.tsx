"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_ACTION,
  EVENT_LABEL,
  OPEN_SHIFT_ERROR,
  TZ,
  blockReason,
  breakMinutes,
  dayState,
  findOpenShift,
  fmtMin,
  hasCoords,
  localDate,
  localDateBR,
  localTime,
  nextEvent,
  secondaryEvent,
  sequenceErrorMessage,
  workedMinutes,
  type Resident,
  type Sector,
  type TimeEntry,
  type TimeEventType,
} from "@/lib/domain";
import { Badge, Button, Toast } from "@/components/ui";
import { PunchMapModal } from "@/components/punch-map";
import { GEO_MESSAGE, getCoords } from "@/lib/geo";
import {
  AlertIcon,
  CloseIcon,
  ListIcon,
  LockIcon,
  MapPinIcon,
} from "@/components/icons";

/** Estado da jornada em destaque — o residente entende a situação sem ler a linha do tempo. */
function StatusBadge({
  state,
  openShift,
}: {
  state: ReturnType<typeof dayState>;
  openShift: boolean;
}) {
  if (openShift)
    return <Badge tone="warn">Jornada anterior em aberto</Badge>;
  if (!state.hasClockIn) return <Badge tone="muted">Jornada não iniciada</Badge>;
  if (state.hasClockOut) return <Badge tone="muted">Jornada encerrada</Badge>;
  if (state.breakOpen) return <Badge tone="warn">Em intervalo</Badge>;
  return <Badge tone="ok">Em jornada</Badge>;
}

export function PontoClient({
  resident,
  sectors,
  userId,
}: {
  resident: Resident;
  sectors: Sector[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [now, setNow] = useState<Date | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [justifiedIds, setJustifiedIds] = useState<Set<string>>(new Set());
  const [sectorId, setSectorId] = useState<string>(
    resident.default_sector_id ?? sectors[0]?.id ?? ""
  );
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<"geo" | "save" | null>(null);
  const [mapEntries, setMapEntries] = useState<TimeEntry[] | null>(null);
  const [mapTitle, setMapTitle] = useState("");

  const flash = useCallback((msg: string, ms = 2600) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const [{ data }, { data: justs }] = await Promise.all([
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
    setEntries((data ?? []) as TimeEntry[]);
    setJustifiedIds(
      new Set((justs ?? []).map((j) => j.related_time_entry_id as string))
    );
  }, [supabase, resident.id]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    load();
    return () => clearInterval(t);
  }, [load]);

  const today = localDate(new Date());
  const todayEvents = entries.filter((e) => localDate(e.event_datetime) === today);
  const openShift = findOpenShift(entries, justifiedIds);
  const state = dayState(todayEvents);
  const primary = nextEvent(todayEvents);
  const secondary = secondaryEvent(todayEvents);
  const secondaryBlock = secondary ? blockReason(secondary, todayEvents) : null;
  const sector = sectors.find((s) => s.id === sectorId);
  const sectorLocked = state.hasClockIn && !state.hasClockOut;
  const worked = now ? workedMinutes(todayEvents, now) : 0;
  const breaks = state.breakCount;
  const todayWithCoords = todayEvents.filter(hasCoords);

  function openMap(list: TimeEntry[], title: string) {
    setMapTitle(title);
    setMapEntries(list);
  }

  async function punch(kind: TimeEventType) {
    if (busy || !sectorId) return;
    if (kind === "clock_in" && openShift) {
      router.push("/justificar");
      return;
    }
    const reason = blockReason(kind, todayEvents);
    if (reason) {
      flash(reason, 3200);
      return;
    }

    setBusy("geo");
    const geo = await getCoords();
    if (!geo.ok) {
      setBusy(null);
      flash(GEO_MESSAGE[geo.reason], 4000);
      return;
    }

    setBusy("save");
    const { error } = await supabase.from("ponto_time_entries").insert({
      resident_id: resident.id,
      event_type: kind,
      sector_id: sectorId,
      origin: "automatic",
      latitude: geo.coords.latitude,
      longitude: geo.coords.longitude,
      device_info: {
        user_agent: navigator.userAgent,
        geo_accuracy_m: geo.coords.accuracy ?? null,
      },
      created_by: userId,
    });
    setBusy(null);
    if (error) {
      if (error.message.includes(OPEN_SHIFT_ERROR)) {
        router.push("/justificar");
        return;
      }
      const friendly = sequenceErrorMessage(error.message);
      flash(friendly ?? `Erro ao registrar: ${error.message}`, 4000);
      load();
      return;
    }
    flash(`${EVENT_LABEL[kind]} registrado às ${localTime(new Date())}`);
    load();
  }

  const todayLabel = now
    ? now.toLocaleDateString("pt-BR", {
        timeZone: TZ,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const clock = now
    ? now.toLocaleTimeString("pt-BR", { timeZone: TZ })
    : "--:--:--";

  const primaryHint = (() => {
    if (!primary) return "";
    if (primary === "clock_in")
      return openShift ? "requer justificativa" : "abre a jornada de hoje";
    if (primary === "break_end") return "encerra o intervalo em aberto";
    if (primary === "break_start")
      return breaks === 0 ? "toque para registrar" : `${breaks}º intervalo encerrado`;
    return "toque para registrar";
  })();

  return (
    <main className="flex flex-1 justify-center px-6 pt-6 pb-16">
      <div className="grid w-full max-w-[940px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_316px]">
        <div className="flex flex-col gap-4">
          {openShift && (
            <div
              role="alert"
              className="flex gap-3 rounded-card border border-warn-300 bg-warn-50 p-4"
            >
              <AlertIcon className="mt-0.5 h-5 w-5 flex-none text-warn-700" />
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-warn-900">
                  Jornada de {localDateBR(openShift.event_datetime)} sem registro
                  de saída
                </p>
                <p className="text-[13px] leading-relaxed text-warn-800">
                  Você precisa justificar antes de iniciar uma nova jornada. A
                  administração é notificada automaticamente.
                </p>
                <Link
                  href="/justificar"
                  className="mt-1 inline-flex self-start rounded-field bg-warn-700 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-warn-800"
                >
                  Justificar agora
                </Link>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-4.5 rounded-panel border border-line bg-surface p-6 shadow-card">
            <div className="flex flex-col items-center gap-1">
              <div className="text-[13px] text-ink-muted">{todayLabel}</div>
              {/* aria-live off: o relógio muda a cada segundo e seria
                  anunciado sem parar pelo leitor de tela. */}
              <div
                aria-hidden
                className="tnum text-[46px] leading-none font-semibold tracking-tighter"
              >
                {clock}
              </div>
              <StatusBadge state={state} openShift={!!openShift} />
            </div>

            <button
              onClick={() => !sectorLocked && setSheet(true)}
              disabled={sectorLocked}
              title={
                sectorLocked
                  ? "O setor é definido no início da jornada"
                  : "Alterar setor"
              }
              className="flex cursor-pointer items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-2 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-default disabled:opacity-80"
            >
              <span className="h-1.75 w-1.75 rounded-full bg-brand-700" />
              <span>Setor: {sector?.name ?? "—"}</span>
              {!sectorLocked && <span className="text-brand-600">alterar</span>}
            </button>

            {primary ? (
              <button
                onClick={() => punch(primary)}
                disabled={!!busy}
                className={`flex h-56 w-56 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-full bg-brand-700 text-white shadow-brand transition-transform hover:bg-brand-800 active:scale-[0.98] disabled:opacity-70 sm:h-60 sm:w-60 ${
                  busy ? "" : "animate-pulse-ring"
                }`}
              >
                <span className="max-w-40 text-[23px] leading-tight font-semibold tracking-tight">
                  {busy === "geo"
                    ? "Obtendo localização…"
                    : busy === "save"
                      ? "Registrando…"
                      : EVENT_ACTION[primary]}
                </span>
                <span className="text-[12.5px] text-brand-200">{primaryHint}</span>
              </button>
            ) : (
              <div className="flex h-56 w-56 flex-col items-center justify-center gap-1.5 rounded-full border border-dashed border-line-strong bg-surface-raised text-center sm:h-60 sm:w-60">
                <span className="text-xl font-semibold text-ink-soft">
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
              <div className="flex flex-col items-center gap-1.5">
                <Button
                  variant="secondary"
                  onClick={() => punch(secondary)}
                  disabled={!!busy || !!secondaryBlock}
                  title={secondaryBlock ?? undefined}
                  icon={secondaryBlock ? <LockIcon className="h-4 w-4" /> : undefined}
                >
                  {EVENT_ACTION[secondary]}
                </Button>
                {secondaryBlock && (
                  <span className="max-w-75 text-center text-[12px] leading-snug text-warn-800">
                    {secondaryBlock}
                  </span>
                )}
              </div>
            )}

            <p className="max-w-85 text-center text-xs leading-relaxed text-ink-faint">
              Cada batida grava sua localização (latitude/longitude), setor e
              dispositivo na trilha de auditoria.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 rounded-panel border border-line bg-surface p-5 shadow-card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Jornada de hoje</span>
            <span className="text-[12.5px] text-ink-muted tabular-nums">
              {fmtMin(worked)}
            </span>
          </div>

          {todayEvents.length === 0 && (
            <div className="rounded-[11px] border border-dashed border-line px-3 py-5 text-center text-[13px] leading-relaxed text-ink-faint">
              Nenhum evento hoje.
              <br />O primeiro registro abre a jornada.
            </div>
          )}

          {todayEvents.map((ev) => (
            <div key={ev.id} className="flex gap-3">
              <div className="flex flex-none flex-col items-center pt-1">
                <div className="h-[9px] w-[9px] rounded-full bg-brand-700" />
                <div className="min-h-[26px] w-px flex-1 bg-line" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium">
                    {EVENT_LABEL[ev.event_type]}
                  </span>
                  {hasCoords(ev) ? (
                    <button
                      onClick={() =>
                        openMap(
                          [ev],
                          `${EVENT_LABEL[ev.event_type]} · ${localTime(ev.event_datetime)}`
                        )
                      }
                      aria-label={`Ver no mapa: ${EVENT_LABEL[ev.event_type]} às ${localTime(ev.event_datetime)}`}
                      className="flex flex-none cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <MapPinIcon className="h-3.5 w-3.5" />
                      mapa
                    </button>
                  ) : (
                    <span
                      title="Batida sem localização"
                      className="flex-none text-[11px] text-ink-faint"
                    >
                      sem GPS
                    </span>
                  )}
                </div>
                <span className="text-xs text-ink-faint">
                  {localTime(ev.event_datetime)} ·{" "}
                  {ev.ponto_sectors?.name ?? ""} ·{" "}
                  {ev.origin === "manual" ? "manual" : "automático"}
                </span>
              </div>
            </div>
          ))}

          {primary && (
            <div className="flex gap-3 opacity-65">
              <div className="mt-1 h-[9px] w-[9px] flex-none rounded-full border border-dashed border-ink-faint" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[13.5px] text-ink-muted">
                  {EVENT_LABEL[primary]}
                </span>
                <span className="text-xs text-ink-faint">aguardando registro</span>
              </div>
            </div>
          )}

          {todayWithCoords.length > 0 && (
            <button
              onClick={() => openMap(todayEvents, `Batidas de hoje · ${localDateBR(new Date())}`)}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-field border border-brand-200 bg-brand-50 py-2.5 text-center text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-100"
            >
              <MapPinIcon className="h-4 w-4" />
              Ver todas no mapa ({todayWithCoords.length})
            </button>
          )}

          <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3.5">
            <div className="flex justify-between text-[12.5px] text-ink-muted">
              <span>Intervalos</span>
              <span>
                {breaks === 0
                  ? "nenhum"
                  : `${breaks} ${breaks === 1 ? "intervalo" : "intervalos"} · ${fmtMin(now ? breakMinutes(todayEvents, now) : 0)}${state.breakOpen ? " · em aberto" : ""}`}
              </span>
            </div>
            <div className="flex justify-between text-[12.5px] text-ink-muted">
              <span>Setor atual</span>
              <span>{sector?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between text-[12.5px] text-ink-muted">
              <span>Origem</span>
              <span>Automático · web</span>
            </div>
          </div>
          <Link
            href="/registros"
            className="flex items-center justify-center gap-2 rounded-field border border-line bg-surface py-2.5 text-center text-[13px] font-medium text-ink-soft transition-colors hover:border-brand-700 hover:text-brand-700"
          >
            <ListIcon className="h-4 w-4" />
            Ver histórico completo
          </Link>
        </div>
      </div>

      {sheet && (
        <div
          className="animate-fade-in fixed inset-0 z-20 flex items-end justify-center bg-ink/40"
          onClick={() => setSheet(false)}
        >
          <div
            className="animate-sheet-in flex w-full max-w-[520px] flex-col gap-4 rounded-t-[20px] bg-surface p-5 pb-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[19px] font-semibold tracking-tight">
                  Onde você está?
                </span>
                <span className="text-[13px] text-ink-muted">
                  O setor fica gravado junto ao evento de ponto.
                </span>
              </div>
              <button
                onClick={() => setSheet(false)}
                aria-label="Fechar"
                className="flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-field border border-line text-ink-muted hover:bg-surface-raised"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex max-h-[300px] flex-col gap-2 overflow-auto">
              {sectors.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSectorId(s.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[11px] p-3 text-left ${
                    s.id === sectorId
                      ? "border-2 border-brand-700 bg-brand-50"
                      : "border border-line bg-surface"
                  }`}
                >
                  <span
                    className={`h-[11px] w-[11px] flex-none rounded-full ${
                      s.id === sectorId
                        ? "bg-brand-700"
                        : "border-[1.5px] border-line-strong"
                    }`}
                  />
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="ml-auto text-xs text-ink-faint">{s.code}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSheet(false)}
              className="cursor-pointer rounded-[11px] bg-brand-700 py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-brand-800"
            >
              Confirmar setor
            </button>
          </div>
        </div>
      )}

      {mapEntries && (
        <PunchMapModal
          title={mapTitle}
          entries={mapEntries}
          onClose={() => setMapEntries(null)}
        />
      )}

      <Toast message={toast} />
    </main>
  );
}
