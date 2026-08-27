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
import { Toast } from "@/components/ui";
import { PunchMapModal } from "@/components/punch-map";
import { GEO_MESSAGE, getCoords } from "@/lib/geo";

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
            <div className="flex gap-3 rounded-[14px] border border-amber-300 bg-amber-50 p-4">
              <div className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-amber-700 text-[13px] font-bold text-white">
                !
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-amber-900">
                  Jornada de {localDateBR(openShift.event_datetime)} sem registro
                  de saída
                </p>
                <p className="text-[13px] leading-relaxed text-amber-800">
                  Você precisa justificar antes de iniciar uma nova jornada. A
                  administração é notificada automaticamente.
                </p>
                <Link
                  href="/justificar"
                  className="mt-0.5 self-start rounded-[9px] bg-amber-700 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-amber-800"
                >
                  Justificar agora
                </Link>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-4.5 rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex flex-col items-center gap-0.5">
              <div className="text-[13px] text-stone-500">{todayLabel}</div>
              <div className="text-[46px] leading-none font-semibold tracking-tighter tabular-nums">
                {clock}
              </div>
            </div>

            <button
              onClick={() => !sectorLocked && setSheet(true)}
              disabled={sectorLocked}
              title={
                sectorLocked
                  ? "O setor é definido no início da jornada"
                  : "Alterar setor"
              }
              className="flex cursor-pointer items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-2 text-[13px] font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-default disabled:opacity-80"
            >
              <span className="h-[7px] w-[7px] rounded-full bg-teal-700" />
              <span>Setor: {sector?.name ?? "—"}</span>
              {!sectorLocked && <span className="text-teal-400">alterar</span>}
            </button>

            {primary ? (
              <button
                onClick={() => punch(primary)}
                disabled={!!busy}
                className="flex h-[216px] w-[216px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-full bg-teal-700 text-white shadow-[0_10px_30px_rgba(15,118,110,0.28)] transition-transform hover:bg-teal-800 active:scale-[0.98] disabled:opacity-70"
              >
                <span className="max-w-[150px] text-[23px] leading-tight font-semibold tracking-tight">
                  {busy === "geo"
                    ? "Obtendo localização…"
                    : busy === "save"
                      ? "Registrando…"
                      : EVENT_ACTION[primary]}
                </span>
                <span className="text-[12.5px] text-teal-200">{primaryHint}</span>
              </button>
            ) : (
              <div className="flex h-[216px] w-[216px] flex-col items-center justify-center gap-1.5 rounded-full border border-dashed border-stone-300 bg-stone-50 text-center">
                <span className="text-xl font-semibold text-stone-600">
                  Jornada
                  <br />
                  encerrada
                </span>
                <span className="text-[12.5px] text-stone-400">
                  {fmtMin(worked)} registradas
                </span>
              </div>
            )}

            {secondary && (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => punch(secondary)}
                  disabled={!!busy || !!secondaryBlock}
                  title={secondaryBlock ?? undefined}
                  aria-disabled={!!secondaryBlock}
                  className="cursor-pointer rounded-[10px] border border-stone-300 bg-white px-4.5 py-2.5 text-[13.5px] font-medium text-stone-700 transition-colors hover:border-teal-700 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-400 disabled:hover:border-stone-200 disabled:hover:text-stone-400"
                >
                  {secondaryBlock ? "🔒 " : ""}
                  {EVENT_ACTION[secondary]}
                </button>
                {secondaryBlock && (
                  <span className="max-w-[300px] text-center text-[12px] leading-snug text-amber-800">
                    {secondaryBlock}
                  </span>
                )}
              </div>
            )}

            <p className="max-w-[340px] text-center text-xs leading-relaxed text-stone-400">
              Cada batida grava sua localização (latitude/longitude), setor e
              dispositivo na trilha de auditoria.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Jornada de hoje</span>
            <span className="text-[12.5px] text-stone-500 tabular-nums">
              {fmtMin(worked)}
            </span>
          </div>

          {todayEvents.length === 0 && (
            <div className="rounded-[11px] border border-dashed border-stone-200 px-3 py-5 text-center text-[13px] leading-relaxed text-stone-400">
              Nenhum evento hoje.
              <br />O primeiro registro abre a jornada.
            </div>
          )}

          {todayEvents.map((ev) => (
            <div key={ev.id} className="flex gap-3">
              <div className="flex flex-none flex-col items-center pt-1">
                <div className="h-[9px] w-[9px] rounded-full bg-teal-700" />
                <div className="min-h-[26px] w-px flex-1 bg-stone-200" />
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
                      title="Ver localização no mapa"
                      className="flex-none cursor-pointer rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-teal-700 hover:bg-teal-50"
                    >
                      📍 mapa
                    </button>
                  ) : (
                    <span
                      title="Batida sem localização"
                      className="flex-none text-[11px] text-stone-300"
                    >
                      sem GPS
                    </span>
                  )}
                </div>
                <span className="text-xs text-stone-400">
                  {localTime(ev.event_datetime)} ·{" "}
                  {ev.ponto_sectors?.name ?? ""} ·{" "}
                  {ev.origin === "manual" ? "manual" : "automático"}
                </span>
              </div>
            </div>
          ))}

          {primary && (
            <div className="flex gap-3 opacity-65">
              <div className="mt-1 h-[9px] w-[9px] flex-none rounded-full border border-dashed border-stone-400" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[13.5px] text-stone-500">
                  {EVENT_LABEL[primary]}
                </span>
                <span className="text-xs text-stone-300">aguardando registro</span>
              </div>
            </div>
          )}

          {todayWithCoords.length > 0 && (
            <button
              onClick={() => openMap(todayEvents, `Batidas de hoje · ${localDateBR(new Date())}`)}
              className="cursor-pointer rounded-[9px] border border-teal-200 bg-teal-50 py-2 text-center text-[13px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
            >
              Ver todas no mapa ({todayWithCoords.length})
            </button>
          )}

          <div className="mt-1 flex flex-col gap-2 border-t border-stone-100 pt-3.5">
            <div className="flex justify-between text-[12.5px] text-stone-500">
              <span>Intervalos</span>
              <span>
                {breaks === 0
                  ? "nenhum"
                  : `${breaks} ${breaks === 1 ? "intervalo" : "intervalos"} · ${fmtMin(now ? breakMinutes(todayEvents, now) : 0)}${state.breakOpen ? " · em aberto" : ""}`}
              </span>
            </div>
            <div className="flex justify-between text-[12.5px] text-stone-500">
              <span>Setor atual</span>
              <span>{sector?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between text-[12.5px] text-stone-500">
              <span>Origem</span>
              <span>Automático · web</span>
            </div>
          </div>
          <Link
            href="/registros"
            className="rounded-[9px] border border-stone-200 bg-white py-2 text-center text-[13px] font-medium text-stone-700 transition-colors hover:border-teal-700 hover:text-teal-700"
          >
            Ver histórico completo
          </Link>
        </div>
      </div>

      {sheet && (
        <div
          className="animate-fade-in fixed inset-0 z-20 flex items-end justify-center bg-stone-900/40"
          onClick={() => setSheet(false)}
        >
          <div
            className="animate-sheet-in flex w-full max-w-[520px] flex-col gap-4 rounded-t-[20px] bg-white p-5 pb-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[19px] font-semibold tracking-tight">
                  Onde você está?
                </span>
                <span className="text-[13px] text-stone-500">
                  O setor fica gravado junto ao evento de ponto.
                </span>
              </div>
              <button
                onClick={() => setSheet(false)}
                className="h-[30px] w-[30px] cursor-pointer rounded-[9px] border border-stone-200 text-[15px] leading-none text-stone-500 hover:bg-stone-100"
              >
                ×
              </button>
            </div>
            <div className="flex max-h-[300px] flex-col gap-2 overflow-auto">
              {sectors.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSectorId(s.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[11px] p-3 text-left ${
                    s.id === sectorId
                      ? "border-2 border-teal-700 bg-teal-50"
                      : "border border-stone-200 bg-white"
                  }`}
                >
                  <span
                    className={`h-[11px] w-[11px] flex-none rounded-full ${
                      s.id === sectorId
                        ? "bg-teal-700"
                        : "border-[1.5px] border-stone-300"
                    }`}
                  />
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="ml-auto text-xs text-stone-400">{s.code}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSheet(false)}
              className="cursor-pointer rounded-[11px] bg-teal-700 py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-teal-800"
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
