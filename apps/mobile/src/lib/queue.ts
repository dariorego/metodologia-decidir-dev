import { Preferences } from "@capacitor/preferences";
import { Network } from "@capacitor/network";
import { supabase } from "./supabase";
import { sequenceErrorMessage, type TimeEventType } from "./domain";

const KEY = "ponto.pending.v1";

/**
 * Batida aguardando sincronização.
 *
 * `id` é gerado no aparelho ANTES do envio e é a primary key da linha no
 * Supabase. Se a resposta se perder (rede caindo no meio), o reenvio usa o
 * mesmo id e o banco recusa com 23505 (duplicate key) — que tratamos como
 * "já sincronizada". É isso que garante que nenhuma batida duplique.
 */
export interface PendingPunch {
  id: string;
  resident_id: string;
  event_type: TimeEventType;
  sector_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** Momento real da batida, no aparelho. Vira event_datetime na sincronização. */
  recorded_at: string;
  created_by: string;
  user_agent: string;
  attempts: number;
  last_error?: string;
}

export function newId(): string {
  // crypto.randomUUID existe no WebView do Android 7+ em contexto seguro.
  // O fallback cobre WebViews antigas, onde só getRandomValues está disponível.
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function readQueue(): Promise<PendingPunch[]> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return [];
  try {
    return JSON.parse(value) as PendingPunch[];
  } catch {
    return [];
  }
}

async function writeQueue(list: PendingPunch[]): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(list) });
}

export async function enqueue(p: PendingPunch): Promise<void> {
  const list = await readQueue();
  if (list.some((x) => x.id === p.id)) return;
  list.push(p);
  await writeQueue(list);
}

export async function isOnline(): Promise<boolean> {
  const s = await Network.getStatus();
  return s.connected;
}

export type FlushResult = {
  synced: number;
  failed: number;
  remaining: number;
  /** Erros definitivos (regra de negócio), que exigem avisar o residente. */
  rejected: { punch: PendingPunch; message: string }[];
};

/** Códigos de erro do Postgres que significam "não adianta tentar de novo". */
function isPermanent(code: string | undefined, message: string): boolean {
  if (code === "23505") return false; // duplicata: já está lá, é sucesso
  if (code === "P0001") return true; // raise exception dos triggers de regra
  if (code === "23514" || code === "23503") return true; // check / FK
  if (code === "42501") return true; // RLS
  return /PONTO_SEQUENCE|RESIDENT_HAS_OPEN_SHIFT/.test(message);
}

/**
 * Envia a fila em ordem cronológica. Para no primeiro erro transitório
 * (rede) para não furar a ordem dos eventos — o banco exige sequência.
 */
export async function flushQueue(): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, failed: 0, remaining: 0, rejected: [] };
  if (!(await isOnline())) {
    result.remaining = (await readQueue()).length;
    return result;
  }

  let list = await readQueue();
  list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  const keep: PendingPunch[] = [];
  let stop = false;

  for (const p of list) {
    if (stop) {
      keep.push(p);
      continue;
    }
    // Batida que sai na hora não informa horário: o servidor carimba com
    // now(), que é inforjável. Só a que ficou parada na fila precisa
    // reivindicar o horário real — e aí o trigger 0005 valida os limites.
    const ageMs = Date.now() - new Date(p.recorded_at).getTime();
    const wasQueued = p.attempts > 0 || ageMs > 60_000;

    const { error } = await supabase.from("ponto_time_entries").insert({
      id: p.id,
      resident_id: p.resident_id,
      event_type: p.event_type,
      sector_id: p.sector_id,
      origin: "automatic",
      latitude: p.latitude,
      longitude: p.longitude,
      ...(wasQueued ? { offline_recorded_at: p.recorded_at } : {}),
      device_info: {
        user_agent: p.user_agent,
        geo_accuracy_m: p.accuracy,
        queued_offline: wasQueued,
      },
      created_by: p.created_by,
    });

    if (!error) {
      result.synced += 1;
      continue;
    }
    // Já existe: o envio anterior chegou, só a resposta se perdeu.
    if (error.code === "23505") {
      result.synced += 1;
      continue;
    }
    if (isPermanent(error.code, error.message)) {
      result.failed += 1;
      result.rejected.push({
        punch: p,
        message: sequenceErrorMessage(error.message) ?? error.message,
      });
      continue; // descarta: reenviar daria o mesmo erro para sempre
    }
    // Transitório (offline no meio do envio): mantém e para aqui.
    p.attempts += 1;
    p.last_error = error.message;
    keep.push(p);
    stop = true;
  }

  await writeQueue(keep);
  result.remaining = keep.length;
  return result;
}

export async function clearQueue(): Promise<void> {
  await Preferences.remove({ key: KEY });
}
