"use client";

/**
 * Écoute une réponse courte du senior au micro et la transforme en texte.
 *
 * Fonctionnement de listen() :
 *  1. le micro enregistre (MediaRecorder) ;
 *  2. le volume est mesuré en continu (Web Audio) : dès que le senior s'est tu pendant
 *     `silenceMs`, l'enregistrement s'arrête tout seul ; s'il ne dit rien, on arrête après `waitMs` ;
 *  3. l'audio est envoyé à Whisper (IA de reconnaissance vocale, via le serveur) ;
 *  4. secours : en parallèle, la reconnaissance du navigateur (Web Speech API) écoute aussi ;
 *     si Whisper est indisponible, c'est son texte qui est utilisé.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { speechToText } from "./api";
import { playListenStart, playListenStop } from "./sounds";

export type VoiceStatus = "idle" | "listening" | "processing";
export type VoiceError = "micro_refuse" | "micro_absent" | null;

interface ListenOptions {
  /** Module concerné (pour les statistiques de l'administrateur) */
  module: string;
  /** Mots attendus, pour aider Whisper (ex. « écouter, raconter ») */
  hint?: string;
  /** Silence (ms) après la parole qui termine l'enregistrement */
  silenceMs?: number;
  /** Durée maximale d'attente si le senior ne dit rien (ms) */
  waitMs?: number;
  /** Durée maximale de l'enregistrement (ms) */
  maxMs?: number;
}

/* --- Types minimaux de la Web Speech API (absents des types TypeScript standard) --- */
interface WebSpeechResultEvent {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface WebSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: WebSpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type WebSpeechCtor = new () => WebSpeechRecognition;

function createWebSpeech(): WebSpeechRecognition | null {
  const w = window as unknown as { SpeechRecognition?: WebSpeechCtor; webkitSpeechRecognition?: WebSpeechCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "fr-FR";
  rec.interimResults = false;
  rec.continuous = false;
  return rec;
}

const SPEECH_THRESHOLD = 0.04; // volume (0 à 1) au-dessus duquel on considère que le senior parle

export function useVoiceInput() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<VoiceError>(null);
  // Volume de la voix du senior (0 à 1), pour montrer à l'écran que le micro l'entend
  const [level, setLevel] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);
  // Compteur d'annulations : une écoute annulée pendant l'ouverture du micro ne démarre pas
  const generationRef = useRef(0);

  // Arrête tout si la page se ferme pendant l'écoute
  useEffect(() => () => cancelRef.current?.(), []);

  const cancel = useCallback(() => {
    generationRef.current++;
    cancelRef.current?.();
    cancelRef.current = null;
    setStatus("idle");
  }, []);

  /** Écoute une réponse. text : ce qui a été entendu (null si rien) · micError : micro refusé ou absent */
  const listen = useCallback(async ({ module, hint, silenceMs = 1500, waitMs = 6000, maxMs = 10000 }: ListenOptions): Promise<{ text: string | null; micError: VoiceError }> => {
    cancelRef.current?.();
    setError(null);
    const myGeneration = ++generationRef.current;
    const stillWanted = () => myGeneration === generationRef.current;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const micError: VoiceError = (err as DOMException)?.name === "NotAllowedError" ? "micro_refuse" : "micro_absent";
      setError(micError);
      return { text: null, micError };
    }
    // Écoute annulée pendant l'autorisation du micro (page quittée…) : on éteint le micro et on s'arrête
    if (!stillWanted()) {
      stream.getTracks().forEach((t) => t.stop());
      return { text: null, micError: null };
    }

    // Signal sonore « à vous » AVANT d'ouvrir l'écoute (pour que le micro ne capte pas le bip)
    await playListenStart();
    if (!stillWanted()) {
      stream.getTracks().forEach((t) => t.stop());
      return { text: null, micError: null };
    }
    setStatus("listening");

    // 1. Enregistrement
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // 4. Secours : reconnaissance du navigateur en parallèle
    let webSpeechText = "";
    const webSpeech = createWebSpeech();
    if (webSpeech) {
      webSpeech.onresult = (e) => {
        webSpeechText = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      };
      webSpeech.onerror = () => {};
      try {
        webSpeech.start();
      } catch {
        /* déjà démarrée ou non autorisée : on garde Whisper seul */
      }
    }

    // 2. Mesure du volume pour détecter la fin de la phrase
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    let spoke = false;
    const recorded = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      const started = Date.now();
      let lastVoice = Date.now();
      let cancelled = false;

      const tick = () => {
        if (cancelled || recorder.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        // Volume moyen (écart au silence, qui vaut 128)
        let sum = 0;
        for (const s of samples) sum += Math.abs(s - 128) / 128;
        const level = sum / samples.length;
        const now = Date.now();
        if (level > SPEECH_THRESHOLD) {
          spoke = true;
          lastVoice = now;
        }
        setLevel(Math.min(1, level * 8)); // amplifié pour l'affichage
        const finished = (spoke && now - lastVoice > silenceMs) || (!spoke && now - started > waitMs) || now - started > maxMs;
        if (finished) recorder.stop();
        else requestAnimationFrame(tick);
      };

      cancelRef.current = () => {
        cancelled = true;
        spoke = false;
        if (recorder.state === "recording") recorder.stop();
        webSpeech?.abort();
      };
      recorder.start();
      requestAnimationFrame(tick);
    });

    await recorded;
    stream.getTracks().forEach((t) => t.stop()); // éteint le micro
    setLevel(0);
    if (spoke) playListenStop(); // signal sonore « c'est noté »
    audioCtx.close().catch(() => {});
    webSpeech?.stop();
    cancelRef.current = null;

    if (!spoke) {
      setStatus("idle");
      return { text: null, micError: null }; // le senior n'a rien dit (ou l'écoute a été annulée)
    }

    // 3. Whisper, avec le secours du navigateur
    setStatus("processing");
    const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    const text = (await speechToText(audio, { module, hint })) ?? webSpeechText;
    setStatus("idle");
    return { text: text.trim() || null, micError: null };
  }, []);

  return { status, error, level, listen, cancel };
}
