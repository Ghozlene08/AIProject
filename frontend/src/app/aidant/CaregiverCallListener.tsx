"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Volume2 } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { Button } from "@/components/ui";
import { CONNECT_TIMEOUT_MS, MIC_CONSTRAINTS, RTC_CONFIG, formatDuration, log } from "@/lib/rtc"; // ← CHANGED

type Incoming = { callId: string; seniorId: string; seniorName: string };

// Simple ringtone (two short tones), repeats every 2 seconds while ringing
let ringCtx: AudioContext | null = null;
function ringOnce() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    ringCtx = ringCtx || new Ctx();
    if (ringCtx.state === "suspended") ringCtx.resume().catch(() => {});
    [0, 0.3].forEach((delay) => {
      const t = ringCtx!.currentTime + delay;
      const osc = ringCtx!.createOscillator();
      const gain = ringCtx!.createGain();
      osc.frequency.value = delay ? 520 : 440;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain);
      gain.connect(ringCtx!.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {
    /* sound is blocked until the page gets a click */
  }
}

export default function CaregiverCallListener() {
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [active, setActive] = useState<Incoming | null>(null);
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0); // ← NEW: call timer
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null); // call this tab has accepted
  const pendingRef = useRef<RTCIceCandidateInit[]>([]);
  const timeoutRef = useRef<number | null>(null);

  const clearConnectTimeout = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // ← NEW: the timer starts when the audio is connected and stops at hang up
  useEffect(() => {
    if (!connected) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setSeconds(0);
    const t = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [connected]);

  const cleanup = useCallback(() => {
    clearConnectTimeout();
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    callIdRef.current = null;
    pendingRef.current = [];
    setActive(null);
    setConnected(false);
    setAudioBlocked(false);
  }, []);

  /* ----- Socket events ----- */
  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onIncoming = (d: Incoming) => {
      log("caregiver: call:incoming", d);
      if (callIdRef.current) return s.emit("call:reject", { callId: d.callId });
      setError("");
      setIncoming(d);
    };

    const onCancelled = (d: { callId: string }) => {
      setIncoming((cur) => (cur?.callId === d.callId ? null : cur));
      if (callIdRef.current === d.callId) cleanup();
    };

    const onTaken = (d: { callId: string }) => {
      if (callIdRef.current === d.callId) return;
      setIncoming((cur) => (cur?.callId === d.callId ? null : cur));
    };

    const onOffer = async (d: { callId: string; offer: RTCSessionDescriptionInit }) => {
      log("caregiver: call:offer received");
      const pc = pcRef.current;
      if (!pc || d.callId !== callIdRef.current) return;
      try {
        await pc.setRemoteDescription(d.offer);
        while (pendingRef.current.length) {
          await pc.addIceCandidate(pendingRef.current.shift()!);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit("call:answer", { callId: d.callId, answer: pc.localDescription });
        log("caregiver: answer sent");
      } catch (err) {
        console.error("Call offer error:", err);
        setError("Impossible d'établir l'appel.");
        cleanup();
      }
    };

    const onIce = async (d: { callId: string; candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc || d.callId !== callIdRef.current) return;
      try {
        if (pc.remoteDescription) await pc.addIceCandidate(d.candidate);
        else pendingRef.current.push(d.candidate);
      } catch (err) {
        console.error("ICE error:", err);
      }
    };

    const onEnded = (d?: { callId?: string; durationSeconds?: number }) => {
      log("caregiver: call:ended", d);
      if (d?.callId && callIdRef.current && d.callId !== callIdRef.current) return;
      cleanup();
    };

    s.on("call:incoming", onIncoming);
    s.on("call:cancelled", onCancelled);
    s.on("call:taken", onTaken);
    s.on("call:offer", onOffer);
    s.on("call:ice-candidate", onIce);
    s.on("call:ended", onEnded);

    return () => {
      s.off("call:incoming", onIncoming);
      s.off("call:cancelled", onCancelled);
      s.off("call:taken", onTaken);
      s.off("call:offer", onOffer);
      s.off("call:ice-candidate", onIce);
      s.off("call:ended", onEnded);
    };
  }, [cleanup]);

  /* ----- Ringtone while an incoming call is waiting ----- */
  useEffect(() => {
    if (!incoming) return;
    ringOnce();
    const t = setInterval(ringOnce, 2000);
    return () => clearInterval(t);
  }, [incoming]);

  // Leaving the page ends the call
  useEffect(() => cleanup, [cleanup]);

  function enableAudio() {
    audioRef.current
      ?.play()
      .then(() => setAudioBlocked(false))
      .catch((err) => log("caregiver: play() still blocked", err));
  }

  async function accept() {
    const call = incoming;
    const s = getSocket();
    if (!call || !s) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      streamRef.current = stream;
      log("caregiver: microphone granted");

      // The peer connection exists BEFORE the senior sends its offer
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

      const remote = new MediaStream();

      pc.onicecandidate = (e) => {
        if (e.candidate) s.emit("call:ice-candidate", { callId: call.callId, candidate: e.candidate.toJSON() });
      };

      pc.ontrack = (e) => {
        log("caregiver: remote track received", e.track.kind);
        remote.addTrack(e.track);
        const el = audioRef.current;
        if (!el) return;
        if (el.srcObject !== remote) el.srcObject = remote;
        el.play()
          .then(() => setAudioBlocked(false))
          .catch((err) => {
            log("caregiver: autoplay blocked", err);
            setAudioBlocked(true);
          });
      };

      pc.oniceconnectionstatechange = () => log("caregiver: ICE state", pc.iceConnectionState);

      pc.onconnectionstatechange = () => {
        log("caregiver: connection state", pc.connectionState);
        if (pc.connectionState === "connected") {
          clearConnectTimeout();
          setConnected(true);
          s.emit("call:connected", { callId: call.callId }); // ← NEW
        } else if (pc.connectionState === "failed") {
          setError("La connexion audio a échoué.");
          cleanup();
        }
      };

      timeoutRef.current = window.setTimeout(() => {
        if (pcRef.current && pcRef.current.connectionState !== "connected") {
          setError("La connexion audio n'a pas pu s'établir.");
          s.emit("call:end", { callId: call.callId });
          cleanup();
        }
      }, CONNECT_TIMEOUT_MS);

      callIdRef.current = call.callId;
      setConnected(false);
      setActive(call);
      setIncoming(null);
      s.emit("call:accept", { callId: call.callId });
      log("caregiver: call:accept emitted", call.callId);
    } catch (err) {
      console.error("Accept error:", err);
      setError("Autorisez le micro pour répondre à l'appel.");
      s.emit("call:reject", { callId: call.callId });
      setIncoming(null);
    }
  }

  function reject() {
    if (incoming) getSocket()?.emit("call:reject", { callId: incoming.callId });
    setIncoming(null);
  }

  function hangUp() {
    if (callIdRef.current) getSocket()?.emit("call:end", { callId: callIdRef.current });
    cleanup();
  }

  return (
    <>
      {/* Must stay in the DOM for the whole life of the component */}
      <audio ref={audioRef} autoPlay playsInline />

      {error && (
        <div className="fixed bottom-4 right-4 z-[110] rounded-xl bg-danger-500 px-4 py-3 text-sm font-bold text-white shadow-pop">
          {error}
        </div>
      )}

      {/* Incoming call */}
      {incoming && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl ring-4 ring-ok-500">
            <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-ok-500 text-white">
              <Phone className="h-10 w-10" />
            </div>
            <h2 className="mt-4 text-2xl font-black text-ink">Appel entrant</h2>
            <p className="mt-1 text-lg font-bold text-ink">{incoming.seniorName}</p>
            <p className="text-sm text-muted">vous appelle</p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={reject}>
                <PhoneOff className="h-4 w-4" /> Refuser
              </Button>
              <Button className="flex-1" onClick={accept}>
                <Phone className="h-4 w-4" /> Répondre
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Call in progress */}
      {active && (
        <div className="fixed bottom-4 right-4 z-[110] flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-pop ring-2 ring-ok-500">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ok-500 text-white">
              <Phone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-ink">{connected ? "En appel" : "Connexion…"}</p>
              <p className="text-xs font-semibold text-muted">{active.seniorName}</p>
            </div>
            {/* ← NEW: timer */}
            {connected && (
              <span className="rounded-lg bg-ok-50 px-2.5 py-1 font-mono text-sm font-extrabold tabular-nums text-ok-600" aria-label="Durée de l'appel">
                {formatDuration(seconds)}
              </span>
            )}
            <Button size="sm" onClick={hangUp}>
              <PhoneOff className="h-4 w-4" /> Raccrocher
            </Button>
          </div>
          {audioBlocked && (
            <Button size="sm" variant="outline" onClick={enableAudio}>
              <Volume2 className="h-4 w-4" /> Activer le son
            </Button>
          )}
        </div>
      )}
    </>
  );
}