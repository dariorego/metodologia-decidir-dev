"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  JUSTIFICATION_TYPE_LABEL,
  TZ,
  localDateBR,
  type Justification,
} from "@/lib/domain";
import { Badge, Toast } from "@/components/ui";

function splitReason(reason: string): { motivo: string; texto: string } {
  const i = reason.indexOf(" — ");
  if (i === -1) return { motivo: reason, texto: "" };
  return { motivo: reason.slice(0, i), texto: reason.slice(i + 3) };
}

function relative(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)}h`;
  if (min < 48 * 60) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ });
}

export default function AprovacoesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Justification[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("ponto_justifications")
      .select(
        "*, ponto_residents(*, ponto_profiles(id, full_name, role)), related:ponto_time_entries!ponto_justifications_related_time_entry_id_fkey(event_datetime)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setItems((data ?? []) as Justification[]);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(j: Justification, status: "approved" | "rejected") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("ponto_justifications")
      .update({
        status,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes[j.id]?.trim() || null,
      })
      .eq("id", j.id);
    if (error) {
      flash(`Erro: ${error.message}`);
      return;
    }
    const name = j.ponto_residents?.ponto_profiles?.full_name ?? "residente";
    flash(
      status === "approved"
        ? `Justificativa de ${name} aprovada`
        : `Justificativa de ${name} reprovada`
    );
    load();
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[23px] font-semibold tracking-tight">
          Justificativas e ajustes
        </h1>
        <p className="text-[13.5px] text-stone-500">
          {items.length}{" "}
          {items.length === 1 ? "item aguardando" : "itens aguardando"} decisão ·
          SLA de 48h
        </p>
      </div>

      {loaded && items.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
          Fila vazia. Nada aguardando decisão.
        </div>
      )}

      {items.map((j) => {
        const { motivo, texto } = splitReason(j.reason);
        const name = j.ponto_residents?.ponto_profiles?.full_name ?? "—";
        return (
          <div
            key={j.id}
            className="grid items-start gap-5 rounded-[14px] border border-stone-200 bg-white p-4.5 lg:grid-cols-[1fr_208px]"
          >
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={j.type === "missed_clock_out" ? "warn" : "ok"}>
                  {JUSTIFICATION_TYPE_LABEL[j.type]}
                </Badge>
                <span className="text-[14.5px] font-semibold">{name}</span>
                <span className="text-[12.5px] text-stone-400">
                  {j.ponto_residents?.program ?? ""} · enviado{" "}
                  {relative(j.created_at)}
                </span>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11.5px] text-stone-400">
                    Data do evento
                  </span>
                  <span className="text-[13px] font-medium">
                    {localDateBR(j.related?.event_datetime ?? j.created_at)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11.5px] text-stone-400">Registrado</span>
                  <span className="text-[13px] font-medium">
                    {j.type === "missed_clock_out" ? "sem saída" : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11.5px] text-stone-400">Solicitado</span>
                  <span className="text-[13px] font-semibold text-teal-700">
                    {j.requested_time ? `saída ${j.requested_time}` : "a definir"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11.5px] text-stone-400">Motivo</span>
                  <span className="text-[13px] font-medium">{motivo}</span>
                </div>
              </div>

              {texto && (
                <div className="rounded-[10px] bg-stone-50 px-3 py-2.5 text-[13px] leading-relaxed text-stone-700">
                  {texto}
                </div>
              )}

              <input
                value={notes[j.id] ?? ""}
                onChange={(e) =>
                  setNotes((n) => ({ ...n, [j.id]: e.target.value }))
                }
                placeholder="Nota de revisão (opcional)"
                className="rounded-[9px] border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-teal-700"
              />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => review(j, "approved")}
                className="cursor-pointer rounded-[10px] bg-teal-700 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-teal-800"
              >
                Aprovar
              </button>
              <button
                onClick={() => review(j, "rejected")}
                className="cursor-pointer rounded-[10px] border border-stone-300 bg-white py-2.5 text-[13.5px] font-medium text-stone-600 transition-colors hover:border-amber-700 hover:text-amber-700"
              >
                Reprovar
              </button>
              <p className="text-[11.5px] leading-snug text-stone-400">
                Decisão registrada na trilha de auditoria com seu usuário e
                horário.
              </p>
            </div>
          </div>
        );
      })}

      <Toast message={toast} />
    </div>
  );
}
