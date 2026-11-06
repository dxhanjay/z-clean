"use client";

import { useEffect, useRef, useState } from "react";
import { shouldSendPing } from "@/lib/tracking";
import { pingFailureStreak } from "@/lib/motion";
import { formatLastUpdated } from "@/lib/tracking-view";

/** Clock label for a sent ping ("2:41:07 pm", IST formatting). */
function lastSentClockLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

type ShareState =
  | "idle"
  | "starting"
  | "sharing"
  | "denied"
  | "unsupported"
  | "error";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

/**
 * Share Location panel (Staff Web App phase) — the rider side of
 * live tracking.
 *
 * Uses the browser Geolocation API's watchPosition (FOREGROUND ONLY:
 * a web page cannot track in the background — when the tab closes or
 * the phone locks, fixes stop, and the panel says so in plain
 * language instead of pretending otherwise). Fixes are thinned by
 * the shared throttle rule in src/lib/tracking.ts (15s / 25m, 2-min
 * heartbeat) before anything is POSTed to /api/tracking/ping, which
 * re-checks the assignment server-side on every single ping.
 *
 * A screen Wake Lock is requested while sharing so the phone does
 * not sleep mid-round where the browser supports it; it is released
 * on stop/unmount and re-acquired when the tab becomes visible
 * again. Every permission state is explained in words a rider can
 * act on.
 *
 * Web3D UI pass: glass panel over the staff shell's ambient
 * backdrop; the sharing state keeps its pulsing live dot and gains
 * a ticking "last update … ago" clock (relative label from
 * tracking-view's formatLastUpdated, refreshed on a 5s interval
 * that runs only while sharing). Ping failures are counted by
 * pingFailureStreak (motion.ts §5): one blip stays silent, the
 * second in a row surfaces a retrying message with an honest
 * "last successful update" time and a "Send an update now" action
 * that re-reads the position and pings immediately (a failed
 * manual retry re-arms the same ≥2-failure note). Retries still
 * only ever happen in the foreground — there is no background
 * sending, ever.
 */
export default function ShareLocationPanel({
  assignmentId,
  initialLastPingAt,
}: {
  assignmentId: string;
  initialLastPingAt: string | null;
}) {
  const [state, setState] = useState<ShareState>("idle");
  const [note, setNote] = useState<string | null>(null);
  /** A ping-failure note is showing (streak ≥ 2) — the manual
   * "Send an update now" action renders under it. */
  const [noteIsPingFailure, setNoteIsPingFailure] = useState(false);
  /** Last fix from the watch — the manual resend reuses it when the
   * fresh read cannot produce one, and pings it directly otherwise. */
  const lastFixRef = useRef<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const manualBusyRef = useRef(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(initialLastPingAt);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ atMs: number; lat: number; lng: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const stateRef = useRef<ShareState>("idle");
  stateRef.current = state;
  /** Consecutive failed pings — see pingFailureStreak (motion.ts §5). */
  const failStreakRef = useRef(0);

  async function acquireWakeLock() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // Wake Lock is a nicety, never a blocker.
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // Already released (e.g. tab hidden) — nothing to do.
    }
    wakeLockRef.current = null;
  }

  function stopWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    void releaseWakeLock();
  }

  async function sendPing(lat: number, lng: number, accuracy: number | null) {
    try {
      const res = await fetch("/api/tracking/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          lat,
          lng,
          ...(accuracy !== null && Number.isFinite(accuracy)
            ? { accuracyM: Math.round(accuracy) }
            : {}),
        }),
      });
      if (res.ok) {
        lastSentRef.current = { atMs: Date.now(), lat, lng };
        setLastSentAt(new Date().toISOString());
        failStreakRef.current = pingFailureStreak(failStreakRef.current, "sent").failures;
        setNote(null);
        setNoteIsPingFailure(false);
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.status === 403 || res.status === 404 || res.status === 409) {
        // The leg closed (handover done / reassigned) — stop sharing.
        stopWatch();
        setState("idle");
        setNote(
          data?.error ??
            "This round is closed, so location sharing has stopped.",
        );
        setNoteIsPingFailure(false);
        return;
      }
      // 429 / 5xx / network blips: count the attempt so the throttle
      // backs off instead of hammering, keep watching. The streak
      // rule keeps a single blip silent (the note would flicker on
      // healthy rounds); from the second failure in a row the
      // rider sees that retries are under way, and when the last
      // update actually landed.
      lastSentRef.current = { atMs: Date.now(), lat, lng };
      const streak = pingFailureStreak(failStreakRef.current, "failed");
      failStreakRef.current = streak.failures;
      if (streak.showRetry) {
        setNote(
          lastSentAt
            ? `Updates are not getting through — retrying as you move. Last update sent ${lastSentClockLabel(lastSentAt)}.`
            : "Updates are not getting through yet — retrying as you move.",
        );
        setNoteIsPingFailure(true);
      }
    } catch {
      lastSentRef.current = { atMs: Date.now(), lat, lng };
      const streak = pingFailureStreak(failStreakRef.current, "failed");
      failStreakRef.current = streak.failures;
      if (streak.showRetry) {
        setNote(
          lastSentAt
            ? `No connection for the updates — retrying as you move. Last update sent ${lastSentClockLabel(lastSentAt)}.`
            : "No connection for the updates yet — retrying as you move.",
        );
        setNoteIsPingFailure(true);
      }
    }
  }

  /**
   * "Send an update now" (retry note action): one immediate ping of
   * the freshest position we can get — a fresh getCurrentPosition
   * read, falling back to the watch's latest fix. It goes straight
   * to sendPing (bypassing the watch throttle, which is exactly the
   * point of a manual retry), so it cannot disturb watch cadence;
   * sendPing's own bookkeeping counts it in the failure streak like
   * any other ping.
   */
  function manualResend() {
    if (manualBusyRef.current || stateRef.current !== "sharing") return;
    manualBusyRef.current = true;
    const finish = (fix: { lat: number; lng: number; accuracy: number | null }) => {
      manualBusyRef.current = false;
      void sendPing(fix.lat, fix.lng, fix.accuracy);
    };
    if (!("geolocation" in navigator)) {
      manualBusyRef.current = false;
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      () => {
        const last = lastFixRef.current;
        if (last) {
          finish(last);
        } else {
          manualBusyRef.current = false;
          setNote("Still no GPS fix to send — keep moving, sharing resumes when it locks on.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  }

  function startSharing() {
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("starting");
    setNote(null);
    setNoteIsPingFailure(false);
    void acquireWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState("sharing");
        const { latitude, longitude, accuracy } = pos.coords;
        lastFixRef.current = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
        };
        const shouldSend = shouldSendPing(lastSentRef.current, {
          atMs: Date.now(),
          lat: latitude,
          lng: longitude,
        });
        if (shouldSend) {
          void sendPing(latitude, longitude, accuracy ?? null);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stopWatch();
          setState("denied");
          return;
        }
        // Position unavailable / timeout: transient on real streets.
        if (stateRef.current === "sharing" || stateRef.current === "starting") {
          setNote("GPS signal is weak right now — keep moving, sharing resumes when it locks on.");
          setNoteIsPingFailure(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  function stopSharing() {
    stopWatch();
    setState("idle");
    setNote(null);
    setNoteIsPingFailure(false);
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && stateRef.current === "sharing") {
        void acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick the "last update … ago" clock — only while sharing, so an
  // idle panel never re-renders on a timer.
  useEffect(() => {
    if (state !== "sharing") return;
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [state]);

  const lastSentMs = lastSentAt ? Date.parse(lastSentAt) : NaN;
  const lastAgoLabel =
    lastSentAt && !Number.isNaN(lastSentMs)
      ? formatLastUpdated(Math.max(0, (nowMs - lastSentMs) / 1000))
      : null;

  return (
    <section id="staff-share-panel" className="glass rounded-[1.75rem] p-5">
      <h2 className="text-base font-extrabold text-ink-900">Share my location</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        While you share, the customer can follow your ride on their order
        page. Sharing works <strong>only while this tab stays open</strong> —
        if you close it or your phone locks, updates pause. Keep this tab
        open and your phone awake during the round.
      </p>

      {state === "sharing" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50/90 px-3 py-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
          </span>
          <p aria-live="polite" className="text-sm font-bold text-brand-800">
            Sharing live
            {lastAgoLabel ? ` · last update ${lastAgoLabel}` : ""}
            {lastSentAt ? ` (${lastSentClockLabel(lastSentAt)})` : ""}
          </p>
        </div>
      )}

      {note && (
        <div className="mt-3 rounded-xl bg-white/70 px-3 py-2">
          <p role="status" className="text-sm text-ink-700">
            {note}
          </p>
          {noteIsPingFailure && state === "sharing" && (
            <button
              type="button"
              onClick={manualResend}
              className="btn-press glass-chip mt-2 min-h-12 rounded-full px-4 py-2 text-xs font-bold text-brand-800"
            >
              Send an update now
            </button>
          )}
        </div>
      )}

      {state === "denied" && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50/95 p-4">
          <p className="text-sm font-bold text-ink-900">Location permission is off</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            Your browser blocked location access, so your ride cannot be
            shared. Tap the lock / site-settings icon in the address bar,
            allow Location for this site, then tap Start sharing again.
          </p>
        </div>
      )}

      {state === "unsupported" && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50/95 p-4">
          <p className="text-sm font-bold text-ink-900">This browser cannot share location</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            Open this page in Chrome (Android) or Safari (iPhone) with
            location services turned on, then try again.
          </p>
        </div>
      )}

      <div className="mt-4">
        {state === "sharing" || state === "starting" ? (
          <button
            type="button"
            onClick={stopSharing}
            className="btn-press min-h-12 w-full rounded-full border border-red-300 bg-white/90 px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            Stop sharing
          </button>
        ) : (
          <button
            type="button"
            onClick={startSharing}
            className="btn-press min-h-12 w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700"
          >
            {state === "denied" ? "Try again — start sharing" : "Start sharing"}
          </button>
        )}
      </div>
    </section>
  );
}
