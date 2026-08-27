import { Geolocation } from "@capacitor/geolocation";

export type GeoFailure = "denied" | "unavailable" | "timeout";

export type GeoFix = { latitude: number; longitude: number; accuracy: number | null };

export type GeoResult =
  | { ok: true; coords: GeoFix }
  | { ok: false; reason: GeoFailure };

export const GEO_MESSAGE: Record<GeoFailure, string> = {
  denied:
    "Permissão de localização negada. Habilite o acesso ao GPS nas configurações do app.",
  unavailable: "GPS indisponível. Verifique se a localização do aparelho está ligada.",
  timeout: "Não foi possível obter o sinal de GPS a tempo. Tente novamente.",
};

/** Pede a permissão de localização ao Android. */
export async function ensureGeoPermission(): Promise<boolean> {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted" || status.coarseLocation === "granted") return true;
    const asked = await Geolocation.requestPermissions({ permissions: ["location"] });
    return asked.location === "granted" || asked.coarseLocation === "granted";
  } catch {
    // requestPermissions não existe em toda plataforma (web, WebView antiga).
    // Não é motivo para bloquear: getCurrentPosition ainda pode funcionar.
    return false;
  }
}

async function tryPosition(timeoutMs: number): Promise<GeoResult> {
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 20000,
    });
    return {
      ok: true,
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      },
    };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (msg.includes("denied") || msg.includes("permission"))
      return { ok: false, reason: "denied" };
    if (msg.includes("time")) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Captura latitude, longitude e precisão pelo GPS do aparelho.
 * A batida exige localização — sem fix, não registra.
 *
 * Tenta ler a posição ANTES de negociar permissão: no Android o próprio
 * getCurrentPosition dispara o diálogo do sistema, e gatear em
 * checkPermissions/requestPermissions fazia a batida ser recusada como
 * "permissão negada" mesmo com o GPS acessível.
 */
export async function getCoords(timeoutMs = 15000): Promise<GeoResult> {
  const first = await tryPosition(timeoutMs);
  if (first.ok || first.reason !== "denied") return first;

  // Só agora pede a permissão explicitamente, e tenta de novo.
  const granted = await ensureGeoPermission();
  if (!granted) return { ok: false, reason: "denied" };
  return tryPosition(timeoutMs);
}

/** Qualidade do sinal, para o indicador de GPS na tela. */
export function accuracyLabel(accuracy: number | null): {
  label: string;
  tone: "ok" | "warn" | "muted";
} {
  if (accuracy == null) return { label: "GPS sem leitura", tone: "muted" };
  if (accuracy <= 20) return { label: `GPS preciso · ±${Math.round(accuracy)} m`, tone: "ok" };
  if (accuracy <= 75) return { label: `GPS razoável · ±${Math.round(accuracy)} m`, tone: "ok" };
  return { label: `GPS impreciso · ±${Math.round(accuracy)} m`, tone: "warn" };
}
