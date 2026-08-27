"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_LABEL,
  TZ,
  localDate,
  localTime,
  sequenceErrorMessage,
  toRecifeISO,
  type Resident,
  type Sector,
  type TimeEntry,
  type TimeEventType,
} from "@/lib/domain";
import { Toast, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/ui";

const ADJUST_REASONS = [
  "Esquecimento do residente",
  "Falha do dispositivo",
  "Sem conexão no setor",
  "Correção de setor",
];

interface AuditRow {
  id: number;
  table_name: string;
  action: string;
  changed_at: string;
  detail: { new?: { event_type?: string; origin?: string } } | null;
}

export default function AjustePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [dayEntries, setDayEntries] = useState<TimeEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [residentId, setResidentId] = useState("");
  const [date, setDate] = useState(localDate(new Date()));
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState<TimeEventType>("clock_out");
  const [sectorId, setSectorId] = useState("");
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [obs, setObs] = useState("");
  const [needsApproval, setNeedsApproval] = useState(true);

  useEffect(() => {
    (async () => {
      const [r, s, a] = await Promise.all([
        supabase
          .from("ponto_residents")
          .select("*, ponto_profiles(id, full_name, role)")
          .eq("status", "active")
          .order("registration_number"),
        supabase.from("ponto_sectors").select("*").eq("active", true).order("name"),
        supabase
          .from("ponto_audit_logs")
          .select("id, table_name, action, changed_at, detail")
          .eq("table_name", "ponto_time_entries")
          .order("changed_at", { ascending: false })
          .limit(5),
      ]);
      setResidents((r.data ?? []) as Resident[]);
      setSectors((s.data ?? []) as Sector[]);
      setAudit((a.data ?? []) as AuditRow[]);
      if (r.data?.length) setResidentId(r.data[0].id);
      if (s.data?.length) setSectorId(s.data[0].id);
    })();
  }, [supabase]);

  const loadDay = useCallback(async () => {
    if (!residentId || !date) {
      setDayEntries([]);
      return;
    }
    const { data } = await supabase
      .from("ponto_time_entries")
      .select("*, ponto_sectors(name)")
      .eq("resident_id", residentId)
      .gte("event_datetime", `${date}T00:00:00-03:00`)
      .lt("event_datetime", `${date}T23:59:59-03:00`)
      .order("event_datetime", { ascending: true });
    setDayEntries((data ?? []) as TimeEntry[]);
  }, [supabase, residentId, date]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  async function save() {
    if (!residentId || !date || !/^\d{2}:\d{2}$/.test(time) || !sectorId) {
      setToast("Preencha residente, data, hora (HH:MM) e setor.");
      setTimeout(() => setToast(null), 2600);
      return;
    }
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: just, error: jError } = await supabase
      .from("ponto_justifications")
      .insert({
        resident_id: residentId,
        type: "manual_adjustment",
        reason: obs.trim() ? `${reason} — ${obs.trim()}` : reason,
        requested_time: time,
        status: needsApproval ? "pending" : "approved",
        ...(needsApproval
          ? {}
          : { reviewed_by: user!.id, reviewed_at: new Date().toISOString() }),
      })
      .select("id")
      .single();

    if (jError || !just) {
      setToast(`Erro: ${jError?.message ?? "justificativa"}`);
      setBusy(false);
      setTimeout(() => setToast(null), 3200);
      return;
    }

    const { data: entry, error: eError } = await supabase
      .from("ponto_time_entries")
      .insert({
        resident_id: residentId,
        event_type: eventType,
        event_datetime: toRecifeISO(date, time),
        sector_id: sectorId,
        origin: "manual",
        justification_id: just.id,
        created_by: user!.id,
      })
      .select("id")
      .single();

    if (eError || !entry) {
      setBusy(false);
      setToast(
        `Erro: ${eError ? (sequenceErrorMessage(eError.message) ?? eError.message) : "ponto"}`
      );
      setTimeout(() => setToast(null), 3200);
      return;
    }
    await supabase
      .from("ponto_justifications")
      .update({ related_time_entry_id: entry.id })
      .eq("id", just.id);
    setBusy(false);
    setToast(
      needsApproval
        ? "Ajuste salvo e enviado para aprovação"
        : "Ajuste salvo com aprovação direta"
    );
    setObs("");
    setTime("");
    loadDay();
    setTimeout(() => setToast(null), 2600);
    if (needsApproval) router.push("/admin/aprovacoes");
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[23px] font-semibold tracking-tight">
          Inserir ou corrigir ponto
        </h1>
        <p className="text-[13.5px] text-ink-muted">
          Toda alteração manual exige motivo e gera registro de auditoria.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-line bg-surface p-5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Residente</label>
              <select
                value={residentId}
                onChange={(e) => setResidentId(e.target.value)}
                className={inputCls}
              >
                {residents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.ponto_profiles?.full_name} · {r.program ?? r.registration_number}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Tipo de evento</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as TimeEventType)}
                className={inputCls}
              >
                {(
                  ["clock_out", "clock_in", "break_start", "break_end"] as const
                ).map((t) => (
                  <option key={t} value={t}>
                    {EVENT_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Hora</label>
              <input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="ex.: 19:40"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Setor</label>
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className={inputCls}
              >
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Motivo do ajuste</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputCls}
              >
                {ADJUST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Observação</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Contexto que justifica a alteração."
              className="min-h-[80px] resize-y rounded-[10px] border border-line px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand-700"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-[11px] bg-surface-raised p-3 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={needsApproval}
              onChange={(e) => setNeedsApproval(e.target.checked)}
              className="h-[15px] w-[15px] accent-brand-700"
            />
            Enviar para aprovação da coordenação
          </label>

          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className={btnPrimary}>
              {busy ? "Salvando…" : "Salvar ajuste"}
            </button>
            <button
              onClick={() => router.push("/admin/agora")}
              className={btnGhost}
            >
              Cancelar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4">
            <span className="text-[12.5px] font-semibold tracking-wide text-ink-muted uppercase">
              Jornada de {date.split("-").reverse().join("/")}
            </span>
            {dayEntries.length === 0 && (
              <span className="text-[13px] text-ink-faint">
                Nenhum evento registrado neste dia.
              </span>
            )}
            {dayEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2.5"
              >
                <span className="text-[13px] text-ink-soft">
                  {EVENT_LABEL[e.event_type]}
                  {e.origin === "manual" ? " · manual" : ""}
                </span>
                <span className="text-[12.5px] font-semibold tabular-nums">
                  {localTime(e.event_datetime)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-4">
            <span className="text-[12.5px] font-semibold tracking-wide text-ink-muted uppercase">
              Trilha de auditoria
            </span>
            {audit.length === 0 && (
              <span className="text-[13px] text-ink-faint">
                Nenhum registro ainda.
              </span>
            )}
            {audit.map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-0.5 border-b border-line pb-2 last:border-0"
              >
                <span className="text-[12.5px] text-ink">
                  {l.action === "insert" ? "Ponto criado" : "Ponto alterado"}
                  {l.detail?.new?.origin === "manual" ? " manualmente" : ""}
                  {l.detail?.new?.event_type
                    ? ` · ${EVENT_LABEL[l.detail.new.event_type as TimeEventType]}`
                    : ""}
                </span>
                <span className="text-[11.5px] text-ink-faint">
                  {new Date(l.changed_at).toLocaleString("pt-BR", {
                    timeZone: TZ,
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Toast message={toast} />
    </div>
  );
}
