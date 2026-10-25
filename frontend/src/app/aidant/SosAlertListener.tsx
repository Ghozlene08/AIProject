"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, PhoneCall, Siren, UserX, X } from "lucide-react";
import { api } from "@/lib/api";
import { useSosEvents, type SosEvent } from "@/lib/socket";
import { fmtTime } from "@/lib/format";
import { Button } from "@/components/ui";
import { useCurrentSenior } from "./SeniorContext";

type Permission = NotificationPermission | "unsupported";

const ALERTS_URL = "/aidant/alertes";

/* ------------------------------------------------------------------ */
/* Texts by event type (SOS or missed check-in)                        */
/* ------------------------------------------------------------------ */

function eventCopy(e: SosEvent) {
  const name = e.seniorName || "Un senior";

  if (e.type === "checkin_manque") {
    return {
      title: "Check-in sans réponse",
      line: "n'a pas répondu à la demande de confirmation",
      notifTitle: "⚠️ Check-in sans réponse",
      notifBody: `${name} n'a pas répondu au check-in. Vérifiez sa situation.`,
    };
  }

  return {
    title: "Urgence SOS",
    line: "a déclenché une alerte",
    notifTitle: "🚨 Urgence SOS",
    notifBody: `${name} a déclenché une alerte d'urgence. Contactez-le immédiatement.`,
  };
}

/* ------------------------------------------------------------------ */
/* Siren (repeats until every alert has been handled)                  */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
let sirenTimer: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// Called on the first click/keypress so the browser allows sound afterwards
function unlockAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

// Soft chime: three gentle sine notes with a smooth fade in/out
function playSirenBurst() {
  const ctx = getCtx();
  if (!ctx || ctx.state !== "running") return; // still locked, retry on next tick

  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 (pleasant major chord)
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.05); // soft attack
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); // slow fade out

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  });
}

// Repeats every 4 seconds until stopSiren() is called
function startSiren() {
  if (sirenTimer) return;
  playSirenBurst();
  sirenTimer = setInterval(playSirenBurst, 4000);
}

function stopSiren() {
  if (sirenTimer) clearInterval(sirenTimer);
  sirenTimer = null;
}

/* ------------------------------------------------------------------ */
/* Native browser notification                                         */
/* ------------------------------------------------------------------ */

// Registers the service worker once and returns its registration
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/sw.js");
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.error("Service worker registration failed", err);
    return null;
  }
}

// Native notification, shown by the OS even if the tab is in the background
async function showBrowserNotification(event: SosEvent) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const copy = eventCopy(event);
  const title = copy.notifTitle;
  const options = {
    body: copy.notifBody,
    tag: `sos-${event.alertId}`, // the same alert never shows twice
    requireInteraction: true, // stays visible until the caregiver reacts
    vibrate: [300, 100, 300, 100, 300],
    data: { url: ALERTS_URL },
  } as NotificationOptions;

  try {
    const reg = await getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
    // Fallback when service workers are unavailable
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.error("Notification failed", err);
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SosAlertListener() {
  const { refreshUnread } = useCurrentSenior();
  const [queue, setQueue] = useState<SosEvent[]>([]);
  const [permission, setPermission] = useState<Permission>("default");
  const [saving, setSaving] = useState(false);

  // Read the current permission once on mount and register the service worker
  useEffect(() => {
    const perm: Permission = "Notification" in window ? Notification.permission : "unsupported";
    setPermission(perm);
    if (perm === "granted") getRegistration();
  }, []);

  // Unlock audio on the first interaction with the page
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      stopSiren();
    };
  }, []);

  // Siren plays while at least one alert is waiting, and stops when the queue is empty
  useEffect(() => {
    if (queue.length > 0) startSiren();
    else stopSiren();
  }, [queue.length]);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    unlockAudio(); // the click also unlocks the siren
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") getRegistration();
  }

  // Add events that are not already in the queue
  const mergeEvents = useCallback((events: SosEvent[]) => {
    if (!events.length) return;
    setQueue((q) => {
      const known = new Set(q.map((e) => e.alertId));
      const fresh = events.filter((e) => !known.has(e.alertId));
      return fresh.length ? [...q, ...fresh] : q;
    });
  }, []);

  // Fetch urgent alerts (SOS + missed check-ins) that are still active on the server
  const fetchActive = useCallback(async () => {
    try {
      const res = await api.get<{ events: SosEvent[] }>("/aidant/sos/active");
      const events: SosEvent[] = (res as any).events ?? (res as any).data?.events ?? [];
      mergeEvents(events);
      return events;
    } catch {
      return [];
    }
  }, [mergeEvents]);

  const onSos = useCallback(
    (event: SosEvent) => {
      setQueue((q) => (q.some((e) => e.alertId === event.alertId) ? q : [event, ...q]));
      refreshUnread();
      // The siren starts by itself through the queue effect above.
      showBrowserNotification(event);
    },
    [refreshUnread],
  );

  useSosEvents(onSos);

  // Recover alerts received while the caregiver was offline
  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // Re-sync when the tab becomes visible again (background tabs can drop the socket)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      fetchActive();
      refreshUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchActive, refreshUnread]);

  const current = queue[0];
  const copy = current ? eventCopy(current) : null;
  const isCheckIn = current?.type === "checkin_manque";

  function dismiss() {
    setQueue((q) => q.slice(1));
  }

  // PATCH /aidant/seniors/:seniorId/alerts/:alertId  { read: true }
  async function markRead() {
    if (!current || saving) return;
    setSaving(true);
    try {
      await api.patch(`/aidant/seniors/${current.seniorId}/alerts/${current.alertId}`, { read: true });
      // Tell the Alertes page (and anything else listening) to reload its list
      window.dispatchEvent(new CustomEvent("sos:handled", { detail: { alertId: current.alertId } }));
      refreshUnread();
      dismiss();
    } catch (err) {
      // Keep the modal open so the caregiver can retry, otherwise the alert
      // would silently stay unread and reappear on the next re-sync
      console.error("Could not mark the alert as read", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* One-time prompt to allow notifications */}
      {permission === "default" && (
        <div className="fixed bottom-4 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl bg-white p-4 shadow-pop ring-1 ring-line">
          <BellRing className="h-6 w-6 shrink-0 text-brand-600" />
          <p className="flex-1 text-sm font-semibold text-ink">
            Activez les notifications pour être prévenu d&apos;une urgence même quand cet onglet est en arrière-plan.
          </p>
          <Button size="sm" onClick={enableNotifications}>
            Activer
          </Button>
        </div>
      )}

      {/* Full-screen emergency modal (SOS or missed check-in) */}
      {current && copy && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="sos-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl ring-4 ring-danger-500">
            <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-danger-500 text-white">
              {isCheckIn ? <UserX className="h-10 w-10" /> : <Siren className="h-10 w-10" />}
            </div>

            <h2 id="sos-title" className="mt-4 text-2xl font-black text-danger-600">
              {copy.title}
            </h2>
            <p className="mt-2 text-lg font-bold text-ink">{current.seniorName || "Un senior"}</p>
            <p className="text-sm text-muted">
              {copy.line} à {fmtTime(current.createdAt)}
            </p>

            {queue.length > 1 && (
              <p className="mt-2 text-xs font-bold text-danger-600">+ {queue.length - 1} autre(s) alerte(s) urgente(s)</p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              {/* Only opens the alerts page: viewing is not the same as handling */}
              <Link href={ALERTS_URL} onClick={dismiss}>
                <Button className="w-full">
                  <PhoneCall className="h-4 w-4" /> Voir l&apos;alerte
                </Button>
              </Link>
              <Button variant="outline" onClick={markRead} disabled={saving}>
                {saving ? "Enregistrement…" : "Marquer comme lue"}
              </Button>
              <button
                onClick={dismiss}
                className="mx-auto mt-1 inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" /> Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}