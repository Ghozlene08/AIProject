"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CONNECT_TIMEOUT_MS, MIC_CONSTRAINTS, RTC_CONFIG, log } from "@/lib/rtc";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type CallState = "idle" | "calling" | "connecting" | "active" | "ended";

/** Voice call from the senior to the caregivers linked to this senior. */
export function useCaregiverCall() {
  const [state, setState] = useState<CallState>("idle");
  const [message, setMessage] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [seconds, setSeconds] = useState(0); // ← NEW: call timer

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Attach this to an <audio autoPlay playsInline /> rendered in your page
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingRef = useRef<RTCIceCandidateInit[]>([]);
  const timeoutRef = useRef<number | null>(null);

  const clearConnectTimeout = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // ← NEW: the timer runs only while the call is active; it keeps its last value on the "ended" screen
  useEffect(() => {
    if (state !== "active") return;
    const startedAt = Date.now();
    setSeconds(0);
    const t = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  // Closes the connection, the microphone and the socket
  const cleanup = useCallback(() => {
    clearConnectTimeout();
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    callIdRef.current = null;
    pendingRef.current = [];
    setAudioBlocked(false);
  }, []);

  // Stops everything and shows a final message
  const finish = useCallback(
    (msg: string) => {
      cleanup();
      setMessage(msg);
      setState("ended");
    },
    [cleanup],
  );

  // Back to the normal screen
  const reset = useCallback(() => {
    cleanup();
    setState("idle");
    setMessage("");
    setSeconds(0); // ← NEW
  }, [cleanup]);

  // Called by the "enable sound" button (a click always allows playback)
  const enableAudio = useCallback(() => {
    audioRef.current
      ?.play()
      .then(() => setAudioBlocked(false))
      .catch((err) => log("senior: play() still blocked", err));
  }, []);

  const start = useCallback(async () => {
    if (callIdRef.current) return; // a call is already running

    const seniorId = localStorage.getItem("seniorId");
    if (!seniorId) {
      setState("ended");
      setMessage("Session expirée. Veuillez vous reconnecter.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("ended");
      setMessage("Le micro n'est pas disponible sur cet appareil.");
      return;
    }

    setSeconds(0); // ← NEW
    setState("calling");
    setMessage("Veuillez patienter, la sonnerie retentit chez votre aidant.");

    // The click that started the call allows the microphone prompt and audio playback
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch {
      finish("Le micro est nécessaire pour appeler. Autorisez-le puis réessayez.");
      return;
    }
    streamRef.current = stream;
    log("senior: microphone granted");

    // Unlock the audio element while we are still inside the user gesture
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.autoplay = true;
    audioRef.current.play().catch(() => {});

    const callId = crypto.randomUUID();
    callIdRef.current = callId;

    const socket = io(SOCKET_URL, { auth: { seniorId }, transports: ["websocket"] });
    socketRef.current = socket;

    socket.once("connect", () => {
      log("senior: socket connected, emitting call:start", callId);
      socket.emit("call:start", { callId });
    });
    socket.on("connect_error", (e) => {
      log("senior: socket connect_error", e.message);
      finish("Connexion impossible. Vérifiez internet puis réessayez.");
    });

    // A caregiver accepted: now the senior sends the WebRTC offer
    socket.on("call:accepted", async (d: { callId: string }) => {
      log("senior: call:accepted", d);
      if (d.callId !== callIdRef.current) return;
      if (pcRef.current) return; // already negotiating

      try {
        setState("connecting");
        setMessage("Connexion en cours…");

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

        // One remote stream that receives every incoming track
        const remote = new MediaStream();

        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit("call:ice-candidate", { callId, candidate: e.candidate.toJSON() });
        };

        pc.ontrack = (e) => {
          log("senior: remote track received", e.track.kind);
          remote.addTrack(e.track);
          const el = audioRef.current;
          if (!el) return;
          if (el.srcObject !== remote) el.srcObject = remote;
          el.play()
            .then(() => setAudioBlocked(false))
            .catch((err) => {
              log("senior: autoplay blocked", err);
              setAudioBlocked(true);
            });
        };

        pc.oniceconnectionstatechange = () => log("senior: ICE state", pc.iceConnectionState);

        pc.onconnectionstatechange = () => {
          log("senior: connection state", pc.connectionState);
          if (pc.connectionState === "connected") {
            clearConnectTimeout();
            setState("active");
            setMessage("Vous pouvez parler.");
            socket.emit("call:connected", { callId }); // ← NEW: the server starts counting the duration
          } else if (pc.connectionState === "failed") {
            finish("La connexion a échoué. Réessayez ou appelez par téléphone.");
          }
        };

        // Don't hang forever if the media path never opens
        timeoutRef.current = window.setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState !== "connected") {
            finish("La connexion audio n'a pas pu s'établir. Réessayez.");
          }
        }, CONNECT_TIMEOUT_MS);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:offer", { callId, offer: pc.localDescription });
        log("senior: offer sent");
      } catch (err) {
        console.error("Call offer error:", err);
        finish("Impossible d'établir l'appel.");
      }
    });

    socket.on("call:answer", async (d: { callId: string; answer: RTCSessionDescriptionInit }) => {
      log("senior: call:answer received");
      const pc = pcRef.current;
      if (!pc || d.callId !== callIdRef.current) return;
      try {
        await pc.setRemoteDescription(d.answer);
        while (pendingRef.current.length) {
          await pc.addIceCandidate(pendingRef.current.shift()!);
        }
      } catch (err) {
        console.error("Call answer error:", err);
      }
    });

    socket.on("call:ice-candidate", async (d: { callId: string; candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc || d.callId !== callIdRef.current) return;
      try {
        if (pc.remoteDescription) await pc.addIceCandidate(d.candidate);
        else pendingRef.current.push(d.candidate);
      } catch (err) {
        console.error("ICE error:", err);
      }
    });

    // Server messages: nobody online / no answer / refused / error
    for (const evt of ["call:unavailable", "call:unanswered", "call:rejected", "call:error"] as const) {
      socket.on(evt, (d: { message?: string }) => {
        log("senior:", evt, d);
        finish(d?.message || "L'appel n'a pas abouti.");
      });
    }

    socket.on("call:ended", () => finish("Votre aidant a raccroché."));
  }, [finish]);

  // The senior hangs up or cancels
  const hangUp = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit("call:end", { callId: callIdRef.current });
    reset();
  }, [reset]);

  // Leaving the page ends the call
  useEffect(() => cleanup, [cleanup]);

  return { state, message, seconds, audioBlocked, audioRef, start, hangUp, reset, enableAudio };
}