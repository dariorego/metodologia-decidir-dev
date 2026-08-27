// Geolocalização obrigatória: cada batida grava latitude/longitude.

export type GeoFailure = "unsupported" | "denied" | "unavailable" | "timeout";

export type GeoResult =
  | { ok: true; coords: GeolocationCoordinates }
  | { ok: false; reason: GeoFailure };

export const GEO_MESSAGE: Record<GeoFailure, string> = {
  unsupported: "Este dispositivo não oferece geolocalização. A batida exige localização.",
  denied: "Permita o acesso à localização no navegador para registrar a batida.",
  unavailable: "Localização indisponível no momento. Tente novamente.",
  timeout: "Não foi possível obter a localização a tempo. Tente novamente.",
};

export async function getCoords(): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, reason: "unsupported" };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, coords: pos.coords }),
      (err) =>
        resolve({
          ok: false,
          reason:
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
        }),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );
  });
}
