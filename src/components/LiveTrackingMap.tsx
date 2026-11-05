"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/tracking";
import type { TrackingPosition } from "@/lib/tracking-view";
import { markerPositionAt, planMarkerTransition } from "@/lib/motion";

/**
 * The live map itself (Phase D; motion added in Phase 5) —
 * Leaflet over OpenStreetMap tiles. Loaded via next/dynamic with
 * ssr:false from LiveTrackingCard (Leaflet needs `window`).
 *
 * Honesty rules baked in:
 *   - The rider marker represents the last REAL ping. When a NEW
 *     real position arrives, the marker GLIDES from the previous
 *     recorded position to the new one over ~1 s (Phase 5) — a
 *     visual transition between two genuine reports, interpolated
 *     by markerPositionAt and planned by planMarkerTransition
 *     (src/lib/motion.ts). It never moves beyond the newest
 *     recorded point, never follows or projects along the route,
 *     and it SNAPS instead of gliding for a first fix, a
 *     near-identical point, an implausible jump (>1.5 km), or a
 *     reduced-motion visitor. When the rider's phone goes quiet,
 *     the marker stays on the last report and the card says so.
 *   - The pulse ring behind the pin exists only while the card
 *     is in its LIVE state (the `pulse` prop) — emphasis of a
 *     real state, never a suggestion of movement.
 *   - The route line is the OSRM road geometry for the rider's
 *     CURRENT reported position, supplied by the card only when
 *     OSRM produced it for that exact position; otherwise no
 *     line. On first appearance it draws itself on (dash-offset)
 *     unless the visitor prefers reduced motion.
 *   - The facility pin renders only when a branch has real
 *     coordinates (set by the owner in admin); the destination
 *     pin only when the order's address geocoded.
 *
 * Markers are divIcons (pure CSS pins) so no Leaflet image assets
 * are needed. The wrapper's `relative z-0` creates a stacking
 * context that confines Leaflet's internal z-indexes (400+) so
 * they can never overlay the site's sticky header (z-40).
 */

interface MapPoint extends LatLng {
  kind: "destination" | "facility";
  label: string;
}

function pinIcon(color: string, glyph: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: "zc-live-pin",
    html:
      `<div style="position:relative;width:34px;height:34px;">` +
      (pulse ? `<span class="zc-pin-pulse"></span>` : "") +
      `<div style="position:absolute;inset:0;background:${color};border:3px solid #ffffff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 6px 14px rgb(15 34 51 / 0.35);"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:13px;font-weight:800;">${glyph}</div>` +
      `</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
  });
}

const RIDER_ICON = (pulse: boolean) => pinIcon("#22786d", "◉", pulse);
const DESTINATION_ICON = () => pinIcon("#0f2233", "⌂");
const FACILITY_ICON = () => pinIcon("#b45309", "Z");

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function LiveTrackingMap({
  rider,
  destination,
  facility,
  routeLine,
  riderLabel,
  pulse,
}: {
  rider: TrackingPosition | null;
  destination: LatLng | null;
  facility: { name: string; lat: number; lng: number } | null;
  routeLine: LatLng[];
  riderLabel: string;
  /** True only while the card is LIVE — drives the pin pulse. */
  pulse: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const staticLayersRef = useRef<L.LayerGroup | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const riderTargetRef = useRef<LatLng | null>(null);
  const riderRecordedAtRef = useRef<string>("");
  const pulseRef = useRef<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const routeKeyRef = useRef<string>("");
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
    staticLayersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Bokaro Steel City — a neutral starting frame until points sync.
    map.setView([23.6693, 86.1511], 13);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      staticLayersRef.current = null;
      riderMarkerRef.current = null;
      riderTargetRef.current = null;
      riderRecordedAtRef.current = "";
      framedKeyRef.current = "";
      routeKeyRef.current = "";
    };
  }, []);

  // Static picture: route line + facility + destination pins.
  useEffect(() => {
    const layers = staticLayersRef.current;
    if (!layers) return;
    layers.clearLayers();

    if (routeLine.length >= 2) {
      const polyline = L.polyline(
        routeLine.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#22786d", weight: 4, opacity: 0.5 },
      ).addTo(layers);

      // Draw-on animation the first time THIS geometry appears.
      const routeKey = routeLine
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .join(";");
      if (routeKey !== routeKeyRef.current) {
        routeKeyRef.current = routeKey;
        if (!prefersReducedMotion()) {
          try {
            const el = polyline.getElement() as SVGPathElement | undefined;
            const length = el?.getTotalLength?.();
            if (el && length && Number.isFinite(length)) {
              el.style.strokeDasharray = `${length}`;
              el.style.strokeDashoffset = `${length}`;
              void el.getBoundingClientRect();
              el.style.transition = "stroke-dashoffset 900ms ease-out";
              el.style.strokeDashoffset = "0";
            }
          } catch {
            // Draw-on is decoration — the line itself already drew.
          }
        }
      }
    }

    const points: MapPoint[] = [];
    if (facility) {
      points.push({ kind: "facility", label: facility.name, lat: facility.lat, lng: facility.lng });
    }
    if (destination) {
      points.push({ kind: "destination", label: "Your address", lat: destination.lat, lng: destination.lng });
    }
    for (const point of points) {
      const icon = point.kind === "destination" ? DESTINATION_ICON() : FACILITY_ICON();
      L.marker([point.lat, point.lng], { icon })
        .bindTooltip(point.label, { direction: "top", offset: [0, -30] })
        .addTo(layers);
    }
  }, [destination, facility, routeLine]);

  // Rider marker: create on first fix, glide or snap after that.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!rider) {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      riderMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      riderTargetRef.current = null;
      riderRecordedAtRef.current = "";
      return;
    }

    const target: LatLng = { lat: rider.lat, lng: rider.lng };
    let marker = riderMarkerRef.current;

    if (!marker) {
      marker = L.marker([target.lat, target.lng], { icon: RIDER_ICON(pulse) })
        .bindTooltip(riderLabel, { direction: "top", offset: [0, -30] })
        .addTo(map);
      riderMarkerRef.current = marker;
      pulseRef.current = pulse;
      riderTargetRef.current = target;
      riderRecordedAtRef.current = rider.recordedAt;
      return;
    }

    marker.setTooltipContent(riderLabel);
    if (pulseRef.current !== pulse) {
      pulseRef.current = pulse;
      marker.setIcon(RIDER_ICON(pulse));
    }
    if (riderRecordedAtRef.current === rider.recordedAt) return;

    const plan = planMarkerTransition(riderTargetRef.current, target, {
      prefersReducedMotion: prefersReducedMotion(),
    });
    riderTargetRef.current = target;
    riderRecordedAtRef.current = rider.recordedAt;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (plan.kind === "snap") {
      marker.setLatLng([target.lat, target.lng]);
      return;
    }

    // Glide strictly between the two recorded points. The start
    // is wherever the marker currently sits (the previous target,
    // or mid-glide if a newer report interrupted one).
    const current = marker.getLatLng();
    const from: LatLng = { lat: current.lat, lng: current.lng };
    const startedAt = performance.now();
    const tick = (now: number) => {
      const pos = markerPositionAt(from, plan.to, now - startedAt, plan.durationMs);
      marker.setLatLng([pos.lat, pos.lng]);
      if (now - startedAt < plan.durationMs) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        marker.setLatLng([plan.to.lat, plan.to.lng]);
        animFrameRef.current = null;
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [rider, riderLabel, pulse]);

  // Framing: reframe only when the picture actually changed — a
  // new rider ping (new recordedAt) or a different pin set — so a
  // customer who panned the map isn't yanked back on every render.
  // Framing uses the rider's newest RECORDED position, never a
  // mid-glide interpolation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const frameKey = [
      rider?.recordedAt ?? "no-rider",
      destination ? `${destination.lat},${destination.lng}` : "no-dest",
      facility ? `${facility.lat},${facility.lng}` : "no-fac",
    ].join("|");
    if (frameKey === framedKeyRef.current) return;

    const points: LatLng[] = [];
    if (facility) points.push({ lat: facility.lat, lng: facility.lng });
    if (destination) points.push({ lat: destination.lat, lng: destination.lng });
    if (rider) points.push({ lat: rider.lat, lng: rider.lng });
    if (points.length === 0) return;
    framedKeyRef.current = frameKey;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
    } else {
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [42, 42], maxZoom: 16 },
      );
    }
  }, [rider, destination, facility]);

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
