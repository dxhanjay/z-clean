"use client";

import { useEffect, useRef, useState } from "react";
import { shouldSendPing } from "@/lib/tracking";

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
  const [lastSentAt, setLastSentAt] = useState<string | null>(initialLastPingAt);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ atMs: number; lat: number; lng: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const stateRef = useRef<ShareState>("idle");
  stateRef.current = state;

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
        setNote(null);
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
        return;
      }
      // 429 / 5xx / network blips: count the attempt so the throttle
      // backs off instead of hammering, keep watching.
      lastSentRef.current = { atMs: Date.now(), lat, lng };
      setNote("A location update could not be sent just now — still trying as you move.");
    } catch {
      lastSentRef.current = { atMs: Date.now(), lat, lng };
      setNote("No connection for the last update — still trying as you move.");
    }
  }

  function startSharing() {
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("starting");
    setNote(null);
    void acquireWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState("sharing");
        const { latitude, longitude, accuracy } = pos.coords;
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
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  function stopSharing() {
    stopWatch();
    setState("idle");
    setNote(null);
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

  const lastSentLabel = lastSentAt
    ? new Date(lastSentAt).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <section className="rounded-2xl border border-mist-200 bg-white p-5">
      <h2 className="text-base font-extrabold text-ink-900">Share my location</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        While you share, the customer can follow your ride on their order
        page. Sharing works <strong>only while this tab stays open</strong> —
        if you close it or your phone locks, updates pause. Keep this tab
        open and your phone awake during the round.
      </p>

      {state === "sharing" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
          </span>
          <p className="text-sm font-bold text-brand-800">
            Sharing live
            {lastSentLabel ? ` · last update ${lastSentLabel}` : ""}
          </p>
        </div>
      )}

      {note && (
        <p role="status" className="mt-3 rounded-xl bg-mist-100 px-3 py-2 text-sm text-ink-700">
          {note}
        </p>
      )}

      {state === "denied" && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-ink-900">Location permission is off</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            Your browser blocked location access, so your ride cannot be
            shared. Tap the lock / site-settings icon in the address bar,
            allow Location for this site, then tap Start sharing again.
          </p>
        </div>
      )}

      {state === "unsupported" && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
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
            className="w-full rounded-full border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            Stop sharing
          </button>
        ) : (
          <button
            type="button"
            onClick={startSharing}
            className="btn-press w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700"
          >
            {state === "denied" ? "Try again — start sharing" : "Start sharing"}
          </button>
        )}
      </div>
    </section>
  );
}
