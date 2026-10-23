"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type SpeechStatus = { consentAI: boolean; llmConfigured: boolean; whisper: boolean; webspeech: boolean; edgeTts: boolean; browserTts: boolean };
export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useVoiceAssistant() {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [profile, setProfile] = useState("");
  const [lastName, setLastName] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [remember, setRemember] = useState(false);
  const seniorId = useRef("");
  const mic = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingCleanup = useRef<(() => void) | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const voiceGeneration = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const capabilities = useRef<SpeechStatus | null>(null);

  function stopSpeaking() {
    voiceGeneration.current += 1;
    audio.current?.pause(); audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
    window.speechSynthesis?.cancel();
  }
  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    mic.current?.stop();
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    async function restore() {
      try {
        const response = await fetch(`${API_URL}/senior/session`, { credentials: "include", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) return;
        const data = await response.json();
        if (controller.signal.aborted) return;
        seniorId.current = data.seniorId;
        setConnected(true); setProfile(data.firstName); setLastName(data.lastName || "");
        try { setRemember(localStorage.getItem(`sa_remember_${data.seniorId}`) === "true"); } catch {}
        const history = await fetch(`${API_URL}/senior/conversation`, { credentials: "include", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (history.ok) { const data = await history.json(); if (!controller.signal.aborted) setMessages(data.turns); }
      } catch { /* Une connexion pourra être relancée avec le bouton micro. */ }
      finally { if (!controller.signal.aborted) setRestoring(false); }
    }
    void restore();
    return () => {
      controller.abort();
      mounted.current = false;
      if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; if (recorder.current.state === "recording") recorder.current.stop(); }
      stream.current?.getTracks().forEach((track) => track.stop());
      recordingCleanup.current?.();
      if (mic.current) { mic.current.onresult = null; mic.current.onend = null; mic.current.onerror = null; mic.current.abort(); }
      stopSpeaking();
    };
  }, []);

  async function request(path: string, body?: unknown, method = "POST") {
    const isAudio = body instanceof Blob;
    const response = await fetch(`${API_URL}/senior${path}`, {
      method, credentials: "include",
      headers: { ...(body === undefined ? {} : { "Content-Type": isAudio ? body.type : "application/json" }) },
      body: body === undefined ? undefined : isAudio ? body : JSON.stringify(body), signal: AbortSignal.timeout(45000),
    });
    if (response.status === 401 && mounted.current) { setConnected(false); setProfile(""); setLastName(""); setMessages([]); setReply(""); setRemember(false); seniorId.current = ""; capabilities.current = null; stopSpeaking(); }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Le service est indisponible. Réessayez.");
    }
    return response;
  }
  function logFallback(capability: "stt" | "tts", status: "succes" | "erreur") {
    void request("/speech-fallback", { capability, status }).catch(() => {});
  }
  async function speak(text: string) {
    stopSpeaking();
    const generation = voiceGeneration.current;
    try {
      if (capabilities.current?.edgeTts === false) throw new Error("Secours TTS");
      setStage("Préparation de la voix…");
      const response = await request("/tts", { text });
      const blob = await response.blob();
      if (!mounted.current || generation !== voiceGeneration.current) return;
      audioUrl.current = URL.createObjectURL(blob);
      const player = new Audio(audioUrl.current); audio.current = player;
      player.onended = () => { if (mounted.current) setStage(""); };
      player.onerror = () => { if (mounted.current && generation === voiceGeneration.current) browserSpeak(text); };
      await player.play();
      if (mounted.current) setStage("Je vous réponds…");
    } catch {
      if (mounted.current && generation === voiceGeneration.current) browserSpeak(text);
    }
  }
  function browserSpeak(text: string) {
    if (capabilities.current?.browserTts === false || !("speechSynthesis" in window)) { setStage(""); setError("Lecture vocale indisponible. La réponse reste affichée."); return; }
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "fr-FR"; speech.rate = 0.9;
    speech.onend = () => { if (mounted.current) setStage(""); logFallback("tts", "succes"); };
    speech.onerror = () => { if (mounted.current) { setStage(""); setError("Appuyez sur Réécouter pour lire la réponse."); } logFallback("tts", "erreur"); };
    window.speechSynthesis.speak(speech); setStage("Je vous réponds…");
  }
  async function send(text: string, channel: "voix" | "ecran" = "ecran") {
    if (!text.trim() || inFlight.current) return;
    if (!connected) { setLoginOpen(true); return; }
    inFlight.current = true; setBusy(true); setError(""); setTranscript(text); setStage("Je réfléchis…");
    stopSpeaking();
    try {
      const response = await request("/chat", { message: text, remember, channel });
      const data = await response.json();
      if (mounted.current) { setReply(data.text); setMessages((previous) => [...previous, { role: "user", content: text }, { role: "assistant", content: data.text }].slice(-12) as ChatMessage[]); setTranscript(""); await speak(data.text); }
    } catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : "Le serveur est injoignable."); setStage(""); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function browserListen() {
    const voiceWindow = window as VoiceWindow;
    const Constructor = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!Constructor || capabilities.current?.webspeech === false) { setError("La reconnaissance de secours est indisponible. Écrivez votre demande dans Messages."); return; }
    const recognition = new Constructor(); mic.current = recognition;
    recognition.lang = "fr-FR"; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (event) => { logFallback("stt", "succes"); void send(event.results[0][0].transcript, "voix"); };
    recognition.onend = () => { if (mounted.current) { setListening(false); } };
    recognition.onerror = (event) => {
      if (!mounted.current) return;
      logFallback("stt", "erreur"); setListening(false); setStage("");
      setError(event.error === "not-allowed" ? "Autorisez le microphone dans votre navigateur." : "Je n’ai pas entendu votre demande. Réessayez ou écrivez-la.");
    };
    try { recognition.start(); setListening(true); setStage("Reconnaissance vocale de secours : je vous écoute…"); }
    catch { setError("Impossible de démarrer le microphone."); }
  }
  async function recordWhisper() {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
    stream.current = media;
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) { media.getTracks().forEach((track) => track.stop()); browserListen(); return; }
    const capture = new MediaRecorder(media, { mimeType: mime }); recorder.current = capture;
    const chunks: BlobPart[] = [];
    let context: AudioContext | undefined;
    let silenceCheck: ReturnType<typeof setInterval> | undefined;
    let detectedVoice = false;
    let lastVoice = Date.now();
    let bytes = 0;
    const maxDuration = setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 20000);
    const cleanup = () => { clearTimeout(maxDuration); clearInterval(silenceCheck); media.getTracks().forEach((track) => track.stop()); if (context) void context.close().catch(() => {}); };
    recordingCleanup.current = cleanup;
    capture.ondataavailable = (event) => { if (event.data.size) { bytes += event.data.size; chunks.push(event.data); if (bytes > 7 * 1024 * 1024 && capture.state === "recording") capture.stop(); } };
    capture.onerror = () => { cleanup(); setListening(false); setError("L’enregistrement a échoué. Réessayez."); };
    capture.onstop = async () => {
      cleanup(); if (!mounted.current) return;
      setListening(false); setBusy(true); setStage("Je transcris votre voix…");
      try {
        if (!chunks.length || (context && !detectedVoice)) { setError("Je n’ai pas entendu votre voix. Réessayez."); return; }
        const response = await request("/stt", new Blob(chunks, { type: mime }));
        const data = await response.json();
        if (mounted.current) { setBusy(false); await send(data.text, "voix"); }
      } catch {
        if (mounted.current) { setError("Whisper est indisponible. Répétez votre demande avec la reconnaissance de secours."); browserListen(); }
      } finally { if (mounted.current) { setBusy(false); if (!inFlight.current) setStage(""); } }
    };
    capture.start(250); setListening(true); setStage("");
    // Arrêt automatique après une pause ; le bouton reste disponible pour arrêter.
    try {
      context = new AudioContext(); await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(media).connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      silenceCheck = setInterval(() => {
        analyser.getFloatTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
        if (rms > 0.012) { detectedVoice = true; lastVoice = Date.now(); }
        if (capture.state === "recording" && ((detectedVoice && Date.now() - lastVoice > 1200) || (!detectedVoice && Date.now() - lastVoice > 8000))) capture.stop();
      }, 100);
    } catch { if (context) void context.close().catch(() => {}); context = undefined; }
  }
  async function listen() {
    if (listening) { stopRecording(); return; }
    if (busy || restoring) return;
    stopSpeaking(); setError("");
    if (!connected) { setLoginOpen(true); return; }
    setBusy(true);
    try {
      const response = await request("/status", undefined, "GET");
      const status: SpeechStatus = await response.json(); capabilities.current = status;
      if (!status.consentAI) throw new Error("Le consentement IA est désactivé. Votre aidant peut l’activer dans votre profil.");
      if (!status.llmConfigured) throw new Error("Aucun fournisseur LLM n’est configuré. Renseignez une clé IA dans backend/.env puis redémarrez le backend.");
      if (status.whisper && typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") await recordWhisper();
      else browserListen();
    } catch (e) { setError(e instanceof Error ? e.message : "Micro indisponible. Vérifiez son autorisation."); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function connect(code: string, pin: string) {
    setBusy(true); setError("");
    try {
      const response = await request("/pair", { code, pin }); const data = await response.json();
      setConnected(true); setProfile(data.firstName); setLastName(data.lastName || ""); seniorId.current = data.seniorId;
      setReply(""); setTranscript(""); setMessages([]); setLoginOpen(false); capabilities.current = null;
      try { setRemember(localStorage.getItem(`sa_remember_${data.seniorId}`) === "true"); } catch {}
      const history = await request("/conversation", undefined, "GET");
      setMessages((await history.json()).turns);
    }
    catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); stopSpeaking();
    try {
      await request("/logout"); setConnected(false); setProfile(""); setLastName(""); setReply(""); setTranscript(""); setMessages([]); setRemember(false); seniorId.current = ""; capabilities.current = null; setError("");
    } catch { setError("La déconnexion a échoué. Réessayez."); }
    finally { setBusy(false); }
  }
  function rememberChoice(value: boolean) { setRemember(value); try { localStorage.setItem(`sa_remember_${seniorId.current}`, String(value)); } catch {} }
  async function forget() {
    setBusy(true); setError(""); stopSpeaking();
    try { await request("/memory", undefined, "DELETE"); setReply(""); setMessages([]); setTranscript(""); setStage("Votre mémoire et votre conversation ont été effacées."); }
    catch { setError("Impossible d’effacer la mémoire. Réessayez."); }
    finally { setBusy(false); }
  }
  return { listening, busy, restoring, transcript, setTranscript, reply, messages, error, stage, loginOpen, setLoginOpen, connected, profile, lastName, remember, setRemember: rememberChoice, listen, send, speak, connect, disconnect, forget };
}
export type VoiceController = ReturnType<typeof useVoiceAssistant>;
