// Tipos de domínio e regras da jornada (espelham o schema ponto_* do Supabase)

export type UserRole = "resident" | "admin";
export type ResidentStatus = "active" | "inactive";
export type TimeEventType = "clock_in" | "break_start" | "break_end" | "clock_out";
export type EntryOrigin = "automatic" | "manual";
export type JustificationType = "missed_clock_out" | "manual_adjustment" | "late_arrival" | "other";
export type JustificationStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Sector {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Resident {
  id: string;
  profile_id: string;
  registration_number: string;
  program: string | null;
  status: ResidentStatus;
  default_sector_id: string | null;
  entry_date: string;
  exit_date: string | null;
  ponto_profiles?: Profile;
}

export interface TimeEntry {
  id: string;
  resident_id: string;
  event_type: TimeEventType;
  event_datetime: string;
  sector_id: string;
  origin: EntryOrigin;
  latitude: number | null;
  longitude: number | null;
  justification_id: string | null;
  created_by: string;
  ponto_sectors?: { name: string };
}

export interface Justification {
  id: string;
  resident_id: string;
  related_time_entry_id: string | null;
  type: JustificationType;
  reason: string;
  requested_time: string | null;
  status: JustificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  ponto_residents?: Resident;
  related?: { event_datetime: string } | null;
}

export const OPEN_SHIFT_ERROR = "RESIDENT_HAS_OPEN_SHIFT";
export const TZ = "America/Recife";

export const EVENT_LABEL: Record<TimeEventType, string> = {
  clock_in: "Início de jornada",
  break_start: "Início de intervalo",
  break_end: "Fim de intervalo",
  clock_out: "Fim de jornada",
};

export const EVENT_ACTION: Record<TimeEventType, string> = {
  clock_in: "Iniciar jornada",
  break_start: "Iniciar intervalo",
  break_end: "Voltar do intervalo",
  clock_out: "Encerrar jornada",
};

export const JUSTIFICATION_TYPE_LABEL: Record<JustificationType, string> = {
  missed_clock_out: "Justificativa",
  manual_adjustment: "Ajuste manual",
  late_arrival: "Atraso",
  other: "Outro",
};

export const REASONS = [
  "Esquecimento",
  "Emergência no setor",
  "Falha do dispositivo",
  "Sem conexão",
  "Outro",
];

/** Data local (America/Recife) no formato YYYY-MM-DD */
export function localDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Hora local HH:MM */
export function localTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function localDateBR(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ });
}

export function fmtMin(m: number): string {
  if (m <= 0) return "0h 00m";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

/** Estado da jornada do dia, derivado da sequência de eventos */
export interface DayState {
  hasClockIn: boolean;
  hasClockOut: boolean;
  /** Intervalo iniciado e ainda não encerrado */
  breakOpen: boolean;
  breakCount: number;
}

export function dayState(todayEvents: TimeEntry[]): DayState {
  let hasClockIn = false;
  let hasClockOut = false;
  let breakOpen = false;
  let breakCount = 0;
  for (const e of todayEvents) {
    if (e.event_type === "clock_in") hasClockIn = true;
    if (e.event_type === "clock_out") hasClockOut = true;
    if (e.event_type === "break_start") {
      breakOpen = true;
      breakCount += 1;
    }
    if (e.event_type === "break_end") breakOpen = false;
  }
  return { hasClockIn, hasClockOut, breakOpen, breakCount };
}

/**
 * Motivo pelo qual uma batida está bloqueada (null = permitida).
 * Regras: entrada e saída 1x/dia; intervalos N x/dia sempre início→fim;
 * saída somente com todos os intervalos encerrados.
 */
export function blockReason(kind: TimeEventType, todayEvents: TimeEntry[]): string | null {
  const st = dayState(todayEvents);
  switch (kind) {
    case "clock_in":
      return st.hasClockIn ? "A entrada da jornada já foi registrada hoje." : null;
    case "break_start":
      if (!st.hasClockIn) return "Registre a entrada da jornada antes do intervalo.";
      if (st.hasClockOut) return "A jornada de hoje já foi encerrada.";
      if (st.breakOpen) return "Encerre o intervalo em aberto antes de iniciar outro.";
      return null;
    case "break_end":
      if (!st.breakOpen) return "Não há intervalo em aberto.";
      return null;
    case "clock_out":
      if (!st.hasClockIn) return "Registre a entrada da jornada antes da saída.";
      if (st.hasClockOut) return "A saída da jornada já foi registrada hoje.";
      if (st.breakOpen) return "Encerre o intervalo antes de registrar a saída da jornada.";
      return null;
  }
}

export function canPunch(kind: TimeEventType, todayEvents: TimeEntry[]): boolean {
  return blockReason(kind, todayEvents) === null;
}

/** Próximo evento primário esperado, a partir do estado do dia */
export function nextEvent(todayEvents: TimeEntry[]): TimeEventType | null {
  const st = dayState(todayEvents);
  if (!st.hasClockIn) return "clock_in";
  if (st.hasClockOut) return null; // jornada encerrada
  if (st.breakOpen) return "break_end";
  return "break_start";
}

/**
 * Evento secundário (atalho). Com intervalo aberto, "Saída da jornada"
 * continua visível mas bloqueada (ver blockReason) até o fim do intervalo.
 */
export function secondaryEvent(todayEvents: TimeEntry[]): TimeEventType | null {
  const st = dayState(todayEvents);
  if (!st.hasClockIn || st.hasClockOut) return null;
  return "clock_out";
}

export const SEQUENCE_ERROR_PREFIX = "PONTO_SEQUENCE:";

/** Traduz erro do trigger ponto_fn_check_sequence em mensagem para o usuário */
export function sequenceErrorMessage(message: string): string | null {
  const i = message.indexOf(SEQUENCE_ERROR_PREFIX);
  if (i < 0) return null;
  const rest = message.slice(i + SEQUENCE_ERROR_PREFIX.length);
  const code = rest.split(":")[0];
  const map: Record<string, string> = {
    GEO_REQUIRED: "Não foi possível obter sua localização. Ative o GPS/permissão e tente de novo.",
    CLOCK_IN_EXISTS: "A entrada da jornada já foi registrada hoje.",
    CLOCK_OUT_EXISTS: "A saída da jornada já foi registrada hoje.",
    NO_CLOCK_IN: "Registre a entrada da jornada primeiro.",
    SHIFT_CLOSED: "A jornada de hoje já foi encerrada.",
    BREAK_OPEN: "Encerre o intervalo em aberto antes de continuar.",
    NO_OPEN_BREAK: "Não há intervalo em aberto.",
  };
  return map[code] ?? rest.split(":").slice(1).join(":").trim();
}

export function hasCoords(
  e: TimeEntry
): e is TimeEntry & { latitude: number; longitude: number } {
  return typeof e.latitude === "number" && typeof e.longitude === "number";
}

/** Minutos trabalhados a partir da sequência de eventos de um dia */
export function workedMinutes(events: TimeEntry[], now?: Date): number {
  let total = 0;
  let open: number | null = null;
  for (const e of events) {
    const t = new Date(e.event_datetime).getTime();
    if (e.event_type === "clock_in" || e.event_type === "break_end") open = t;
    if ((e.event_type === "break_start" || e.event_type === "clock_out") && open !== null) {
      total += t - open;
      open = null;
    }
  }
  if (open !== null && now) total += now.getTime() - open;
  return Math.max(0, Math.round(total / 60000));
}

export function breakMinutes(events: TimeEntry[], now?: Date): number {
  let total = 0;
  let open: number | null = null;
  for (const e of events) {
    const t = new Date(e.event_datetime).getTime();
    if (e.event_type === "break_start") open = t;
    if (e.event_type === "break_end" && open !== null) {
      total += t - open;
      open = null;
    }
  }
  if (open !== null && now) total += now.getTime() - open;
  return Math.max(0, Math.round(total / 60000));
}

/**
 * Encontra a jornada em aberto de dias anteriores: o último clock_in em data
 * local < hoje que não tem clock_out posterior. Retorna o registro em aberto.
 */
export function findOpenShift(
  entries: TimeEntry[],
  justifiedEntryIds: Set<string> = new Set()
): TimeEntry | null {
  const today = localDate(new Date());
  const sorted = [...entries].sort(
    (a, b) => new Date(a.event_datetime).getTime() - new Date(b.event_datetime).getTime()
  );
  let open: TimeEntry | null = null;
  for (const e of sorted) {
    if (localDate(e.event_datetime) >= today) break;
    if (e.event_type === "clock_in") open = justifiedEntryIds.has(e.id) ? null : e;
    if (e.event_type === "clock_out") open = null;
  }
  return open;
}

/** Agrupa eventos por data local */
export function groupByDay(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const map = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const d = localDate(e.event_datetime);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(e);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.event_datetime).getTime() - new Date(b.event_datetime).getTime());
  }
  return map;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Timestamp ISO de N dias atrás (janela de consulta) */
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** Monta timestamptz ISO a partir de data (YYYY-MM-DD) e hora (HH:MM) locais de Recife (UTC-3, sem horário de verão) */
export function toRecifeISO(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(";")
    )
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
