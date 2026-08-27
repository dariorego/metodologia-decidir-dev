"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  REASONS,
  localDateBR,
  localTime,
  sequenceErrorMessage,
  type Resident,
  type TimeEntry,
} from "@/lib/domain";
import { GEO_MESSAGE, getCoords } from "@/lib/geo";
import { Pill, btnGhost } from "@/components/ui";

const MIN_CHARS = 20;

export function JustificarClient({
  resident,
  openShift,
  userId,
}: {
  resident: Resident;
  openShift: TimeEntry;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [reason, setReason] = useState<string | null>(null);
  const [exitTime, setExitTime] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chars = text.trim().length;
  const ok = !!reason && chars >= MIN_CHARS;
  const openDate = localDateBR(openShift.event_datetime);

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);

    // A nova entrada exige geolocalização: obtém antes de gravar qualquer coisa.
    const geo = await getCoords();
    if (!geo.ok) {
      setError(GEO_MESSAGE[geo.reason]);
      setBusy(false);
      return;
    }

    const { data: just, error: jError } = await supabase
      .from("ponto_justifications")
      .insert({
        resident_id: resident.id,
        related_time_entry_id: openShift.id,
        type: "missed_clock_out",
        reason: `${reason} — ${text.trim()}`,
        requested_time: exitTime || null,
      })
      .select("id")
      .single();

    if (jError || !just) {
      setError(jError?.message ?? "Erro ao enviar justificativa.");
      setBusy(false);
      return;
    }

    // Com a justificativa registrada, o novo início de jornada é liberado.
    const { error: pError } = await supabase.from("ponto_time_entries").insert({
      resident_id: resident.id,
      event_type: "clock_in",
      sector_id: resident.default_sector_id ?? openShift.sector_id,
      origin: "automatic",
      latitude: geo.coords.latitude,
      longitude: geo.coords.longitude,
      justification_id: just.id,
      device_info: {
        user_agent: navigator.userAgent,
        geo_accuracy_m: geo.coords.accuracy ?? null,
      },
      created_by: userId,
    });

    if (pError) {
      setError(sequenceErrorMessage(pError.message) ?? pError.message);
      setBusy(false);
      return;
    }
    router.replace("/ponto");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[#fffdf7] px-6 py-10">
      <div className="flex w-full max-w-[600px] flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-warn-700 text-[13px] font-bold text-white">
            !
          </div>
          <span className="text-[13px] font-semibold tracking-wider text-warn-800 uppercase">
            Justificativa obrigatória
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[27px] leading-tight font-semibold tracking-tight">
            Sua jornada de {openDate} não foi encerrada
          </h1>
          <p className="text-[14.5px] leading-relaxed text-ink-soft">
            Para iniciar uma nova jornada, informe o que aconteceu. A
            administração recebe a justificativa para revisão e o registro fica
            na trilha de auditoria.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
          <span className="text-[12.5px] font-semibold tracking-wide text-ink-muted uppercase">
            Registro em aberto
          </span>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[13.5px]">
              <span className="text-ink-muted">Início de jornada</span>
              <span className="font-medium">
                {openDate} · {localTime(openShift.event_datetime)}
              </span>
            </div>
            <div className="flex justify-between text-[13.5px]">
              <span className="text-ink-muted">Setor</span>
              <span className="font-medium">
                {openShift.ponto_sectors?.name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between text-[13.5px]">
              <span className="text-ink-muted">Fim de jornada</span>
              <span className="font-semibold text-warn-700">não registrado</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-4.5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold">Motivo</label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <Pill key={r} active={reason === r} onClick={() => setReason(r)}>
                  {r}
                </Pill>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className="text-[13px] font-semibold">
                Horário real de saída
              </label>
              <span className="text-xs text-ink-faint">{openDate}</span>
            </div>
            <input
              value={exitTime}
              onChange={(e) => setExitTime(e.target.value)}
              placeholder="ex.: 07:20"
              className="rounded-[10px] border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-700"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className="text-[13px] font-semibold">Descrição</label>
              <span className="text-xs text-ink-faint">
                {chars >= MIN_CHARS
                  ? "mínimo atingido"
                  : `mínimo de ${MIN_CHARS} caracteres · faltam ${MIN_CHARS - chars}`}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Descreva o que impediu o registro de saída."
              className="min-h-[92px] resize-y rounded-[10px] border border-line px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand-700"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-[10px] border border-warn-300 bg-warn-50 px-3.5 py-3 text-[13px] text-warn-900">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button onClick={() => router.push("/ponto")} className={btnGhost}>
            Voltar
          </button>
          <button
            onClick={submit}
            disabled={!ok || busy}
            className={`flex-1 rounded-[11px] py-3 text-sm font-semibold text-white transition-colors ${
              ok
                ? "cursor-pointer bg-brand-700 hover:bg-brand-800"
                : "cursor-not-allowed bg-line-strong"
            }`}
          >
            {busy ? "Enviando…" : "Enviar e iniciar jornada"}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-ink-faint">
          {ok
            ? "A administração será notificada e a jornada de hoje será aberta em seguida."
            : "Selecione um motivo e escreva ao menos 20 caracteres para continuar."}
        </p>
      </div>
    </main>
  );
}
