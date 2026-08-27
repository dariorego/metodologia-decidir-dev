"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  EVENT_LABEL,
  hasCoords,
  localDateBR,
  localTime,
  type TimeEntry,
} from "@/lib/domain";

const COLORS: Record<TimeEntry["event_type"], string> = {
  clock_in: "#0f766e",
  break_start: "#b45309",
  break_end: "#d97706",
  clock_out: "#44403c",
};

function fmtCoord(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Mapa (Leaflet + OpenStreetMap) com um marcador por batida.
 * Cada marcador mostra tipo, data/hora e coordenadas.
 */
export function PunchMap({ entries, className = "" }: { entries: TimeEntry[]; className?: string }) {
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

      map = L.map(el, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      pts.forEach((e, i) => {
        const ll = L.latLng(e.latitude, e.longitude);
        bounds.extend(ll);
        L.circleMarker(ll, {
          radius: 9,
          color: "#fff",
          weight: 2,
          fillColor: COLORS[e.event_type],
          fillOpacity: 0.95,
        })
          .bindTooltip(String(i + 1), {
            permanent: true,
            direction: "center",
            className: "punch-map-label",
          })
          .bindPopup(
            `<div style="font:13px/1.4 system-ui;min-width:180px">
               <strong>${EVENT_LABEL[e.event_type]}</strong><br/>
               ${localDateBR(e.event_datetime)} · ${localTime(e.event_datetime)}<br/>
               <span style="color:#78716c">${fmtCoord(e.latitude, e.longitude)}</span>
               ${e.ponto_sectors?.name ? `<br/><span style="color:#78716c">${e.ponto_sectors.name}</span>` : ""}
             </div>`
          )
          .addTo(map!);
      });

      if (pts.length === 1) map.setView(bounds.getCenter(), 17);
      else map.fitBounds(bounds, { padding: [32, 32], maxZoom: 18 });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [entries]);

  const pts = entries.filter(hasCoords);
  if (pts.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-[12px] border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-400 ${className}`}>
        Nenhuma batida com localização.
      </div>
    );
  }
  return <div ref={ref} className={`rounded-[12px] ${className}`} />;
}

/** Modal com mapa + lista das batidas plotadas */
export function PunchMapModal({
  title,
  entries,
  onClose,
}: {
  title: string;
  entries: TimeEntry[];
  onClose: () => void;
}) {
  const pts = entries.filter(hasCoords);
  return (
    <div
      className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-stone-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[760px] flex-col gap-3 overflow-hidden rounded-[18px] bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[17px] font-semibold tracking-tight">{title}</span>
            <span className="text-[12.5px] text-stone-500">
              {pts.length} {pts.length === 1 ? "batida com localização" : "batidas com localização"}
              {pts.length < entries.length ? ` · ${entries.length - pts.length} sem localização` : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="h-[30px] w-[30px] flex-none cursor-pointer rounded-[9px] border border-stone-200 text-[15px] leading-none text-stone-500 hover:bg-stone-100"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <PunchMap entries={entries} className="h-[360px] w-full overflow-hidden border border-stone-200" />

        {pts.length > 0 && (
          <div className="flex max-h-[180px] flex-col gap-1.5 overflow-auto">
            {pts.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 text-[12.5px]">
                <span
                  className="flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: COLORS[e.event_type] }}
                >
                  {i + 1}
                </span>
                <span className="font-medium">{EVENT_LABEL[e.event_type]}</span>
                <span className="text-stone-500 tabular-nums">
                  {localDateBR(e.event_datetime)} · {localTime(e.event_datetime)}
                </span>
                <span className="ml-auto text-stone-400 tabular-nums">
                  {fmtCoord(e.latitude, e.longitude)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
