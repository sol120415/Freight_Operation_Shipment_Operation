"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { createClient, uniqueChannel } from "@/lib/supabase/client";
import type { Shipment } from "@/types";

export interface ParcelMapProps {
  parcelId: string;
  /** Last known coordinates (may be null until a GPS event exists). */
  lat: number | null;
  lng: number | null;
  trackingNumber: string;
}

/**
 * Live parcel map (Leaflet + OpenStreetMap tiles — no API key required).
 *
 * Position updates arrive over Supabase Realtime's WebSocket channel as
 * `UPDATE` events on this parcel's row — zero polling. The service worker
 * caches visited tiles so the last-known position stays visible offline.
 */
export default function ParcelMap({
  parcelId,
  lat,
  lng,
  trackingNumber,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: any = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const hasFix = lat !== null && lng !== null;
      const center: [number, number] = hasFix ? [lat!, lng!] : [12.8797, 121.774]; // PH centroid

      const map = L.map(containerRef.current, {
        center,
        zoom: hasFix ? 14 : 5,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(containerRef.current);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      // Lightweight divIcon — no external marker image assets to break.
      const courierIcon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:#ec4899;border:3px solid #fff;box-shadow:0 0 0 4px rgba(236,72,153,.3),0 2px 6px rgba(0,0,0,.35)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      if (hasFix) {
        markerRef.current = L.marker(center, { icon: courierIcon })
          .addTo(map)
          .bindPopup(`<b>${trackingNumber}</b><br/>Courier position`)
          .openPopup();
      }

      // Live broadcast: row UPDATE → move the marker (WebSocket push).
      const supabase = createClient();
      channel = supabase
        .channel(uniqueChannel(`parcel-map-${parcelId}`))
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "shipments",
            filter: `id=eq.${parcelId}`,
          },
          (payload) => {
            const next = payload.new as Shipment;
            if (next.current_lat === null || next.current_lng === null) return;
            const pos: [number, number] = [next.current_lat, next.current_lng];
            if (!markerRef.current) {
              markerRef.current = L.marker(pos, { icon: courierIcon }).addTo(map);
            } else {
              markerRef.current.setLatLng(pos);
            }
            map.panTo(pos, { animate: true });
            toastPulse(map);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      void channel?.unsubscribe();
      mapRef.current?.remove?.();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [lat, lng, parcelId, trackingNumber]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-52 sm:h-64 md:h-72 w-full max-w-full rounded-xl z-0 min-h-[13rem]"
        role="application"
        aria-label="Live parcel map"
      />
      {lat === null && lng === null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-semibold text-slate-500">
            No GPS fix yet — showing facility-level tracking only
          </p>
        </div>
      )}
    </div>
  );
}

/** Brief ring animation on the map container when a new fix arrives. */
function toastPulse(map: { getContainer: () => HTMLElement }) {
  const el = map.getContainer();
  el.style.boxShadow = "0 0 0 3px rgba(236,72,153,.45)";
  setTimeout(() => (el.style.boxShadow = ""), 600);
}
