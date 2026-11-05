"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  TRACKING_POLL_MS,
  buildOsrmRouteUrl,
  deriveTrackingChips,
  mergeLatestPosition,
  parseOsrmRoute,
  parseRealtimePosition,
  trackingCardState,
  type TrackingFeed,
  type TrackingPosition,
} from "@/lib/tracking-view";
import type { LatLng } from "@/lib/tracking";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Customer live tracking (Phase D) — the map card on the order page.
 *
 * Data discipline (the whole point of the feature):
 *   - The card renders ONLY while a leg is genuinely live
 *     (trackingCardState): active rider assignment + matching order
 *     status. Otherwise it renders nothing — tracking is simply
 *     not on offer for the order yet, and no placeholder map, stock
 *     imagery or simulated marker ever stands in.
 *   - Positions arrive from two real sources and are merged by
 *     recordedAt (newer wins): Supabase Realtime inserts on
 *     rider_locations (RLS-scoped to the order's owner), and a 20 s
 *     poll of GET /api/tracking/[orderId] as fallback/heartbeat.
 *   - The ETA is OSRM's road duration between the rider's current
 *     reported position and the customer's geocoded address. If
 *     OSRM fails or either point is missing, there is no ETA chip.
 *   - A position older than 3 minutes flips the card to the stale
 *     presentation: the marker stays on the last reported spot and
 *     the copy says updates are paused.
 */

const LiveTrackingMap = dynamic(() => import("./LiveTrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] w-full items-center justify-center bg-mist-100 text-sm font-semibold text-ink-500 sm:h-[380px]">
      Loading the map…
    </div>
  ),
});

interface OsrmState {
  /** The rider recordedAt this answer belongs to. */
  forKey: string;
  durationSec: number | null;
  geometry: LatLng[];
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function LiveTrackingCard({
  orderId,
  initialFeed,
}: {
  orderId: string;
  initialFeed: TrackingFeed | null;
}) {
  const [feed, setFeed] = useState<TrackingFeed | null>(initialFeed);
  const [position, setPosition] = useState<TrackingPosition | null>(
    initialFeed?.latestPosition ?? null,
  );
  const [osrm, setOsrm] = useState<OsrmState | null>(null);
  const [gone, setGone] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  /* Poll the feed — the heartbeat that also refreshes the
     assignment, the order status context and the pins. */
  useEffect(() => {
    if (gone) return;
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(`/api/tracking/${orderId}`);
        if (!res.ok) {
          // 401/403/404: this viewer cannot track this order — the
          // card retires quietly instead of retrying forever.
          if ([401, 403, 404].includes(res.status)) {
            if (!cancelled) setGone(true);
          }
          return;
        }
        const json = (await res.json()) as TrackingFeed & { mode?: string };
        if (cancelled || json.mode !== "live") return;
        setFeed(json);
        setPosition((prev) => mergeLatestPosition(prev, json.latestPosition));
      } catch {
        // Network blip — the next tick retries; last state stands.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), TRACKING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId, gone]);

  /* Realtime — rider pings land here the moment the staff app
     sends them (RLS scopes the stream to this order's owner). */
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;
    try {
      const supabase = createClient();
      channel = supabase
        .channel(`rider-locations-${orderId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "rider_locations",
            filter: `order_id=eq.${orderId}`,
          },
          (payload) => {
            const next = parseRealtimePosition(
              (payload as { new?: unknown }).new,
            );
            if (next) {
              setPosition((prev) => mergeLatestPosition(prev, next));
            }
          },
        )
        .subscribe();
      return () => {
        if (channel) void supabase.removeChannel(channel);
      };
    } catch {
      // Realtime is an enhancement — the 20 s poll still carries it.
      return;
    }
  }, [orderId]);

  /* OSRM route + ETA for the rider's CURRENT position. Keyed to
     the position's recordedAt: a stale answer for an older position
     is never displayed against a newer one. */
  const destination = feed?.destination ?? null;
  const positionKey = position?.recordedAt ?? null;
  useEffect(() => {
    if (!position || !destination || !positionKey) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(buildOsrmRouteUrl(position, destination), {
          signal: controller.signal,
        });
        const parsed = res.ok ? parseOsrmRoute(await res.json()) : null;
        if (cancelled) return;
        setOsrm({
          forKey: positionKey,
          durationSec: parsed?.durationSec ?? null,
          geometry: parsed?.geometry ?? [],
        });
      } catch {
        if (!cancelled) {
          setOsrm({ forKey: positionKey, durationSec: null, geometry: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionKey, destination?.lat, destination?.lng]);

  /* Local 1 s ticker for the "last updated" chip + stale flip. */
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (gone || !feed) return null;

  const state = trackingCardState({
    status: feed.order.status,
    assignment: feed.assignment,
    latestPosition: position,
    nowMs,
  });
  if (state.kind === "hidden") return null;

  const name = state.riderFirstName;
  const headline =
    state.leg === "pickup"
      ? `${name ?? "Your rider"} is on the way to pick up your laundry`
      : `${name ?? "Your rider"} is bringing your laundry back to you`;

  const osrmForCurrent =
    osrm && position && osrm.forKey === position.recordedAt ? osrm : null;
  const chips = deriveTrackingChips({
    rider: position,
    destination,
    osrmDurationSec: osrmForCurrent?.durationSec ?? null,
    lastPingAt: position?.recordedAt ?? feed.lastPingAt,
    nowMs,
  });
  const routeLine =
    osrmForCurrent && state.kind !== "waiting" ? osrmForCurrent.geometry : [];

  return (
    <div className="mt-6 overflow-hidden rounded-[2rem] bg-white shadow-soft ring-1 ring-mist-200/70">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <h2 className="font-bold text-ink-900">Live tracking</h2>
        {state.kind === "live" && (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
            </span>
            Live
          </span>
        )}
        {state.kind === "stale" && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
            Updates paused
          </span>
        )}
        {state.kind === "waiting" && (
          <span className="inline-flex items-center rounded-full bg-mist-100 px-3 py-1 text-xs font-bold text-ink-700">
            Rider assigned
          </span>
        )}
      </div>

      <p className="px-6 pt-2 text-sm font-semibold text-ink-900">{headline}</p>

      {state.kind === "waiting" ? (
        <div className="px-6 pb-6 pt-3">
          <div className="rounded-3xl bg-mist-50 p-5 ring-1 ring-mist-200/70">
            <p className="text-sm leading-relaxed text-ink-700">
              Your rider hasn&apos;t started sharing location yet — this map
              will light up when they&apos;re on the way. There is nothing
              you need to do; just keep this page open or check back in a
              little while.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-6 pt-4">
            <div className="overflow-hidden rounded-3xl ring-1 ring-mist-200/70">
              <LiveTrackingMap
                rider={position}
                destination={destination}
                facility={feed.facility}
                routeLine={routeLine}
                riderLabel={name ? `${name} (your rider)` : "Your rider"}
                pulse={state.kind === "live"}
              />
            </div>
          </div>

          {state.kind === "stale" && state.lastPingAt && (
            <div className="px-6 pt-4">
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200/70">
                Location updates paused — last seen at{" "}
                {fmtClock(state.lastPingAt)}. The rider&apos;s phone may be
                locked or briefly out of coverage; the map shows the last
                reported position.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 px-6 pb-6 pt-4">
            {chips.distanceLabel && (
              <span className="rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-bold text-ink-700">
                Distance to you · {chips.distanceLabel}
              </span>
            )}
            {chips.etaLabel && (
              <span className="rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700">
                Estimated arrival · ~{chips.etaLabel}
              </span>
            )}
            {chips.lastUpdatedLabel && (
              <span className="rounded-full bg-mist-100 px-3.5 py-1.5 text-xs font-bold text-ink-700">
                Updated {chips.lastUpdatedLabel}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
