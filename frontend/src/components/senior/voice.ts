"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { seniorToken } from "@/lib/seniorApi";

/*
 * Voix de l'interface Senior.
 * - Écoute : l'enregistrement (envoyé à Whisper) et la reconnaissance du navigateur (secours)
 *   tournent en parallèle ; la fin de la phrase est détectée automatiquement (silence).
 * - Parole : synthèse vocale du navigateur en français.
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export const canRecord = () =>
  typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export interface Capture {
  blob: Blob | null;
  browserText: string;
}

const SILENCE_MS = 1500; // fin de phrase après 1,5 s de silence
const MAX_MS = 12000;
const NO_SPEECH_MS = 6000;

export function useVoiceCapture() {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [interim, setInterim] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  // Le micro reste ouvert pendant toute la conversation (plus rapide, pas de nouvelle autorisation
  // à chaque tour) ; il est libéré à la fermeture de l'assistant (release) ou au démontage.
  const streamRef = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    stopRef.current?.();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const listen = useCallback(async (): Promise<Capture> => {
    setInterim("");
    let browserText = "";
    const recognition = getRecognition();

    let stream: MediaStream | null = streamRef.current?.active ? streamRef.current : null;
    if (!stream && canRecord()) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        streamRef.current = stream;
      } catch {
        stream = null; // micro refusé : on tente la reconnaissance du navigateur seule
      }
    }
    if (!stream && !recognition) throw new Error("micro");

    return new Promise<Capture>((resolve) => {
      const chunks: BlobPart[] = [];
      let recorder: MediaRecorder | null = null;
      let ctx: AudioContext | null = null;
      let timer: number | undefined;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(timer);
        try {
          recognition?.stop();
        } catch {}
        const done = () => {
          ctx?.close().catch(() => {});
          setListening(false);
          setLevel(0);
          stopRef.current = null;
          const type = recorder?.mimeType || "audio/webm";
          resolve({ blob: chunks.length ? new Blob(chunks, { type }) : null, browserText: browserText.trim() });
        };
        if (recorder && recorder.state !== "inactive") {
          recorder.onstop = () => setTimeout(done, 50);
          recorder.stop();
        } else setTimeout(done, 250); // laisse arriver le dernier résultat du navigateur
      };
      stopRef.current = finish;

      if (stream) {
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.start(250);

        // Détection de fin de phrase par le niveau sonore
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const started = Date.now();
        let spoke = false;
        let lastVoice = Date.now();
        timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          setLevel(Math.min(1, rms * 12));
          if (rms > 0.02) {
            spoke = true;
            lastVoice = Date.now();
          }
          const now = Date.now();
          if ((spoke && now - lastVoice > SILENCE_MS) || now - started > MAX_MS || (!spoke && now - started > NO_SPEECH_MS)) finish();
        }, 100);
      } else {
        timer = window.setTimeout(finish, MAX_MS);
      }

      if (recognition) {
        recognition.lang = "fr-FR";
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.onresult = (e) => {
          const text = Array.from(e.results)
            .map((r) => r[0].transcript)
            .join(" ");
          browserText = text;
          setInterim(text);
        };
        recognition.onerror = () => {};
        recognition.onend = () => {
          if (!stream) finish(); // sans enregistrement, la fin du navigateur clôt l'écoute
        };
        try {
          recognition.start();
        } catch {}
      }
      setListening(true);
    });
  }, []);

  const stop = useCallback(() => stopRef.current?.(), []);
  useEffect(() => release, [release]);

  return { listen, stop, release, listening, level, interim };
}

/* ---------- Synthèse vocale ---------- */

let frenchVoice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("fr"));
  frenchVoice = voices.find((v) => /natural|neural|online/i.test(v.name)) ?? voices.find((v) => v.lang === "fr-FR") ?? voices[0] ?? null;
  return frenchVoice;
}

let currentAudio: HTMLAudioElement | null = null;

/**
 * Lit un texte à voix haute.
 * - par défaut : voix du navigateur (instantanée, pour le dialogue où chaque seconde compte) ;
 * - { natural: true } : voix naturelle du serveur (Edge TTS → Gemini TTS, ~4 s de préparation),
 *   pour les rappels et le briefing ; en cas d'échec, retour à la voix du navigateur.
 */
export async function speak(text: string, options: { natural?: boolean } = {}): Promise<void> {
  if (!text) return;
  if (options.natural) {
    const played = await playNatural(text);
    if (played) return;
  }
  return speakBrowser(text);
}

async function playNatural(text: string): Promise<boolean> {
  const token = seniorToken.get();
  if (!token || typeof Audio === "undefined") return false;
  try {
    const res = await fetch(`${API_URL}/senior/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return false;
    const url = URL.createObjectURL(await res.blob());
    stopSpeaking();
    const audio = new Audio(url);
    currentAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("lecture"));
      audio.play().catch(reject);
    });
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  } finally {
    currentAudio = null;
  }
}

function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.92; // débit un peu plus lent, plus confortable
    const voice = frenchVoice ?? pickVoice();
    if (voice) u.voice = voice;
    const safety = window.setTimeout(resolve, Math.max(4000, text.length * 90));
    u.onend = () => {
      window.clearTimeout(safety);
      resolve();
    };
    u.onerror = () => {
      window.clearTimeout(safety);
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}

export const stopSpeaking = () => {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
};

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}
