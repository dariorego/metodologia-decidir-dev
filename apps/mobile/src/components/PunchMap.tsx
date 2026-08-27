import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  EVENT_LABEL,
  hasCoords,
  localDateBR,
  localTime,
  type TimeEntry,
} from "../lib/domain";

export const EVENT_COLOR: Record<TimeEntry["event_type"], string> = {
  clock_in: "#0f766e",
  break_start: "#b45309",
  break_end: "#d97706",
  clock_out: "#44403c",
};

export function fmtCoord(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Popup montado com nós do DOM — o Leaflet aplicaria string via innerHTML (XSS). */
function buildPopup(e: TimeEntry & { latitude: number; longitude: number }): HTMLElement {
  const box = document.createElement("div");
  box.style.font = "13px/1.45 system-ui";
  box.style.minWidth = "170px";

  const title = document.createElement("strong");
  title.textContent = EVENT_LABEL[e.event_type];
  box.append(title, document.createElement("br"));

  const when = document.createElement("span");
  when.textContent = `${localDateBR(e.event_datetime)} · ${localTime(e.event_datetime)}`;
  box.append(when, document.createElement("br"));

  const coords = document.createElement("span");
  coords.style.color = "#78716c";
  coords.textContent = fmtCoord(e.latitude, e.longitude);
  box.append(coords);

  if (e.ponto_sectors?.name) {
    const sector = document.createElement("span");
    sector.style.color = "#78716c";
    sector.textContent = e.ponto_sectors.name;
    box.append(document.createElement("br"), sector);
  }
  if (e.is_offline) {
    const off = document.createElement("span");
    off.style.color = "#b45309";
    off.textContent = "registrada offline";
    box.append(document.createElement("br"), off);
  }
  return box;
}

export function PunchMap({
  entries,
  className = "",
}: {
  entries: TimeEntry[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const pts = entries.filter(hasCoords);
    if (!el || pts.length === 0) return;

    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      map = L.map(el, { zoomControl: false, attributionControl: true });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      pts.forEach((e, i) => {
        const ll = L.latLng(e.latitude, e.longitude);
        bounds.extend(ll);
        L.circleMarker(ll, {
          radius: 11,
          color: "#fff",
          weight: 2.5,
          fillColor: EVENT_COLOR[e.event_type],
          fillOpacity: 0.95,
        })
          .bindTooltip(String(i + 1), {
            permanent: true,
            direction: "center",
            className: "punch-map-label",
          })
          .bindPopup(buildPopup(e))
          .addTo(map!);
      });

      if (pts.length === 1) map.setView(bounds.getCenter(), 17);
      else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });

      // O WebView calcula o tamanho depois do primeiro layout.
      setTimeout(() => map?.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [entries]);

  if (entries.filter(hasCoords).length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-card border border-dashed border-line-strong bg-surface-raised px-4 text-center text-sm text-ink-faint ${className}`}
      >
        Nenhuma batida com localização hoje.
      </div>
    );
  }
  return <div ref={ref} className={className} />;
}
