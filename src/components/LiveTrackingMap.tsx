"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/tracking";
import type { TrackingPosition } from "@/lib/tracking-view";

/**
 * The live map itself (Phase D) — Leaflet over OpenStreetMap tiles.
 * Loaded via next/dynamic with ssr:false from LiveTrackingCard
 * (Leaflet needs `window`).
 *
 * Honesty rules baked in:
 *   - The rider marker sits exactly on the last REAL ping. It is
 *     never interpolated, animated between points, or projected
 *     forward — when the rider's phone goes quiet, the marker
 *     stays where the last report put it and the card says so.
 *   - The route line is the OSRM road geometry for the rider's
 *     CURRENT reported position, supplied by the card only when
 *     OSRM produced it for that exact position; otherwise no line.
 *   - The facility pin renders only when a branch has real
 *     coordinates (set by the owner in admin); the destination pin
 *     only when the order's address geocoded.
 *
 * Markers are divIcons (pure CSS pins) so no Leaflet image assets
 * are needed. The wrapper's `relative z-0` creates a stacking
 * context that confines Leaflet's internal z-indexes (400+) so
 * they can never overlay the site's sticky header (z-40).
 */

interface MapPoint extends LatLng {
  kind: "rider" | "destination" | "facility";
  label: string;
}

function pinIcon(color: string, glyph: string): L.DivIcon {
  return L.divIcon({
    className: "zc-live-pin",
    html:
      `<div style="position:relative;width:34px;height:34px;">` +
      `<div style="position:absolute;inset:0;background:${color};border:3px solid #ffffff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 6px 14px rgb(15 34 51 / 0.35);"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:13px;font-weight:800;">${glyph}</div>` +
      `</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
  });
}

const RIDER_ICON = () => pinIcon("#22786d", "◉");
const DESTINATION_ICON = () => pinIcon("#0f2233", "⌂");
const FACILITY_ICON = () => pinIcon("#b45309", "Z");

export default function LiveTrackingMap({
  rider,
  destination,
  facility,
  routeLine,
  riderLabel,
}: {
  rider: TrackingPosition | null;
  destination: LatLng | null;
  facility: { name: string; lat: number; lng: number } | null;
  routeLine: LatLng[];
  riderLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const framedKeyRef = useRef<string>("");

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Bokaro Steel City — a neutral starting frame until points sync.
    map.setView([23.6693, 86.1511], 13);
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      framedKeyRef.current = "";
    };
  }, []);

  // Sync markers + route whenever the inputs change.
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    const points: MapPoint[] = [];
    if (facility) {
      points.push({ kind: "facility", label: facility.name, lat: facility.lat, lng: facility.lng });
    }
    if (destination) {
      points.push({ kind: "destination", label: "Your address", lat: destination.lat, lng: destination.lng });
    }
    if (rider) {
      points.push({ kind: "rider", label: riderLabel, lat: rider.lat, lng: rider.lng });
    }

    if (routeLine.length >= 2) {
      L.polyline(
        routeLine.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#22786d", weight: 4, opacity: 0.5 },
      ).addTo(layers);
    }

    for (const point of points) {
      const icon =
        point.kind === "rider"
          ? RIDER_ICON()
          : point.kind === "destination"
            ? DESTINATION_ICON()
            : FACILITY_ICON();
      L.marker([point.lat, point.lng], { icon })
        .bindTooltip(point.label, { direction: "top", offset: [0, -30] })
        .addTo(layers);
    }

    // Reframe only when the picture actually changed — a new rider
    // ping (new recordedAt) or a different pin set — so a customer
    // who panned the map isn't yanked back on every render.
    const frameKey = [
      rider?.recordedAt ?? "no-rider",
      destination ? `${destination.lat},${destination.lng}` : "no-dest",
      facility ? `${facility.lat},${facility.lng}` : "no-fac",
    ].join("|");
    if (frameKey !== framedKeyRef.current && points.length > 0) {
      framedKeyRef.current = frameKey;
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 15);
      } else {
        map.fitBounds(
          L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
          { padding: [42, 42], maxZoom: 16 },
        );
      }
    }
  }, [rider, destination, facility, routeLine, riderLabel]);

  return (
    <div className="relative z-0">
      <div
        ref={containerRef}
        role="img"
        aria-label="Map with your rider's last reported location"
        className="h-[320px] w-full bg-mist-100 sm:h-[380px]"
      />
    </div>
  );
}
