"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, tokenStore } from "@/lib/api";

const root = API_URL.replace(/\/+$/, "");
const ENDPOINT = `${root.endsWith("/api") ? root : `${root}/api`}/senior/assistant`;
export type AssistantMessage = { role: "user" | "assistant"; content: string; sourceUrl?: string; weatherDate?: string };
export const ASSISTANT_PATHS = { medications: "/senior/medicaments", agenda: "/senior/agenda", documents: "/senior/documents", messages: "/senior/messages", home: "/senior/connexion-reussie" } as const;
export type AssistantTarget = keyof typeof ASSISTANT_PATHS | "contacts" | "sos";
export const ACTION_LABELS: Record<AssistantTarget, string> = { medications: "Ouvrir mes médicaments", agenda: "Ouvrir mon agenda", documents: "Ouvrir mes documents", messages: "Ouvrir mes messages", home: "Retourner à l’accueil", contacts: "Ouvrir mes contacts", sos: "Ouvrir la confirmation SOS" };
type Session = { senior: { _id: string; firstName: string; lastName: string; photoUrl?: string }; contacts?: { name: string; phone: string; relation: string }[]; consentAI: boolean; llm: boolean; whisper: boolean; webspeech: boolean; edgetts: boolean; browsertts: boolean };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function useSeniorAssistant({ paused = false, onAction }: { paused?: boolean; onAction?: (target: AssistantTarget) => void } = {}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [remember, setRememberState] = useState(false);
  const [action, setAction] = useState<AssistantTarget | null>(null);
  const pendingAction = useRef<AssistantTarget | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const generation = useRef(0);
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const media = useRef<MediaStream | null>(null);
  const cleanupRecording = useRef<(() => void) | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const abort = useRef<AbortController | null>(null);
  const operation = useRef(0);

  const stopSpeaking = useCallback(() => {
    if (actionTimer.current) { clearTimeout(actionTimer.current); actionTimer.current = null; }
    generation.current += 1;
    if (player.current) { player.current.onended = null; player.current.onerror = null; player.current.pause(); player.current = null; }
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = ""; }
    window.speechSynthesis?.cancel();
  }, []);
  const stop = useCallback(() => {
    pendingAction.current = null;
    if (alive.current) setAction(null);
    operation.current += 1;
    stopSpeaking(); abort.current?.abort();
    if (recorder.current) { recorder.current.onstop = null; recorder.current.onerror = null; if (recorder.current.state === "recording") recorder.current.stop(); }
    if (recognition.current) { recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.onend = null; recognition.current.abort(); }
    cleanupRecording.current?.(); media.current?.getTracks().forEach((track) => track.stop());
    if (alive.current) { setListening(false); setStage(""); }
  }, [stopSpeaking]);

  const request = useCallback(async (path: string, body?: unknown, method = "POST", signal?: AbortSignal) => {
    const token = tokenStore.get();
    const audio = body instanceof Blob;
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}${path}`, { method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": audio ? body.type : "application/json" }) },
        body: body === undefined ? undefined : audio ? body : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
      });
    } catch (cause) { if (signal?.aborted) throw cause; throw new Error("Le serveur est injoignable. Réessayez dans quelques instants."); }
    if (response.status === 401) { sessionRef.current = null; if (alive.current) { setSession(null); setMessages([]); } throw new Error("Votre session Senior a expiré. Veuillez vous reconnecter."); }
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "Le service est temporairement indisponible."); }
    return response;
  }, []);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    async function restore() {
      try {
        if (!tokenStore.get()) return;
        const response = await request("/session", undefined, "GET", controller.signal);
        const value: Session = await response.json();
        if (controller.signal.aborted) return;
        sessionRef.current = value; setSession(value);
        try { setRememberState(localStorage.getItem(`careai_f1_remember_${value.senior._id}`) === "true"); } catch {}
        const history = await request("/conversation", undefined, "GET", controller.signal);
        const data = await history.json();
        if (!controller.signal.aborted) setMessages(data.turns);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Impossible de charger la conversation."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void restore();
    return () => { alive.current = false; controller.abort(); stop(); };
  }, [request, stop]);
  useEffect(() => { if (paused) stop(); }, [paused, stop]);

  function logVoice(capability: "stt" | "tts", status: "succes" | "erreur") { void request("/speech-event", { capability, status }).catch(() => {}); }
  function browserSpeak(text: string, done: () => void) {
    if (!sessionRef.current?.browsertts || !("speechSynthesis" in window)) { setStage(""); setNotice("La lecture vocale est indisponible. La réponse reste dans Messages."); done(); return; }
    const speech = new SpeechSynthesisUtterance(text); speech.lang = "fr-FR"; speech.rate = 0.9;
    speech.onend = () => { if (alive.current) setStage(""); logVoice("tts", "succes"); done(); };
    speech.onerror = (event) => { if (event.error === "canceled" || event.error === "interrupted") return; if (alive.current) { setStage(""); setNotice("Appuyez sur Réécouter dans Messages pour lire la réponse."); } logVoice("tts", "erreur"); done(); };
    window.speechSynthesis.speak(speech); setStage("Je vous réponds…");
  }
  async function speak(text: string, onDone?: () => void) {
    stopSpeaking(); const current = generation.current;
    let finished = false;
    const done = () => {
      if (finished || !alive.current || current !== generation.current) return;
      finished = true;
      if (actionTimer.current) { clearTimeout(actionTimer.current); actionTimer.current = null; }
      onDone?.();
    };
    if (onDone) actionTimer.current = setTimeout(done, 20000);
    try {
      if (!sessionRef.current?.edgetts) throw new Error("Secours TTS");
      setStage("Préparation de la voix…");
      const response = await request("/tts", { text });
      const blob = await response.blob();
      if (!alive.current || current !== generation.current) return;
      audioUrl.current = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl.current); player.current = audio;
      audio.onended = () => { if (alive.current && current === generation.current) setStage(""); done(); };
      audio.onerror = () => { if (alive.current && current === generation.current) browserSpeak(text, done); };
      await audio.play();
      if (alive.current && current === generation.current) setStage("Je vous réponds…");
    } catch { if (alive.current && current === generation.current) browserSpeak(text, done); }
  }
  function executeAction() {
    const target = pendingAction.current;
    if (!target || paused || !onAction) return;
    pendingAction.current = null; setAction(null); stopSpeaking(); setStage(""); onAction(target);
  }
  async function send(text = draft, channel: "voix" | "ecran" = "ecran") {
    if (locked.current || !text.trim() || paused) return;
    if (!sessionRef.current) { setError("Connectez-vous comme Senior pour discuter avec votre assistant."); return; }
    if (!sessionRef.current.consentAI) { setError("Les services IA sont désactivés dans votre profil."); return; }
    locked.current = true; pendingAction.current = null; setAction(null); setBusy(true); setError(""); setNotice(""); setDraft(text); setStage("Je réfléchis…"); stopSpeaking();
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await request("/chat", { message: text, remember, channel }, "POST", controller.signal);
      const data = await response.json();
      if (!alive.current || controller.signal.aborted) return;
      setMessages((previous) => [...previous, { role: "user", content: text }, { role: "assistant", content: data.text, ...(data.sourceUrl === "https://open-meteo.com/" ? { sourceUrl: data.sourceUrl, weatherDate: data.weatherDate } : {}) }].slice(-12) as AssistantMessage[]);
      const target = data.action?.type === "navigate" && Object.hasOwn(ACTION_LABELS, data.action.target) ? data.action.target as AssistantTarget : null;
      pendingAction.current = target; setAction(target);
      setDraft(""); await speak(data.text, target ? executeAction : undefined);
    } catch (cause) { if (alive.current && !controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "La réponse est indisponible."); setStage(""); } }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  function browserListen() {
    const w = window as VoiceWindow; const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor || !sessionRef.current?.webspeech) { setError("La reconnaissance vocale de secours n’est pas disponible. Écrivez dans Messages."); return; }
    const mic = new Constructor(); recognition.current = mic;
    mic.lang = "fr-FR"; mic.continuous = false; mic.interimResults = false;
    mic.onresult = (event) => { logVoice("stt", "succes"); void send(event.results[0][0].transcript, "voix"); };
    mic.onend = () => { if (alive.current) setListening(false); };
    mic.onerror = (event) => { if (alive.current) { setListening(false); setStage(""); setError(event.error === "not-allowed" ? "Autorisez le microphone dans votre navigateur." : "Je n’ai pas entendu votre voix. Réessayez."); } logVoice("stt", "erreur"); };
    try { mic.start(); setListening(true); setStage(""); } catch { setError("Impossible de démarrer le microphone."); }
  }
  async function recordWhisper() {
    const currentOperation = operation.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (!alive.current || paused || currentOperation !== operation.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    media.current = stream;
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) { stream.getTracks().forEach((track) => track.stop()); browserListen(); return; }
    const capture = new MediaRecorder(stream, { mimeType: mime }); recorder.current = capture;
    const chunks: BlobPart[] = []; let bytes = 0; let ctx: AudioContext | undefined;
    let poll: ReturnType<typeof setInterval> | undefined; let heard = false; let lastVoice = Date.now();
    const limit = setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 25000);
    const cleanup = () => { clearTimeout(limit); clearInterval(poll); stream.getTracks().forEach((track) => track.stop()); if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {}); };
    cleanupRecording.current = cleanup;
    capture.ondataavailable = (event) => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > 7 * 1024 * 1024 && capture.state === "recording") capture.stop(); } };
    capture.onerror = () => { cleanup(); if (alive.current) { setListening(false); setError("L’enregistrement a échoué. Réessayez."); } };
    capture.onstop = async () => {
      cleanup(); if (!alive.current || currentOperation !== operation.current) return;
      setListening(false); setBusy(true); setStage("Je transcris votre voix…");
      try {
        if (!chunks.length || (ctx && !heard)) { setError("Je n’ai pas entendu votre voix. Réessayez."); return; }
        const response = await request("/stt", new Blob(chunks, { type: mime }));
        const data = await response.json();
        if (alive.current && currentOperation === operation.current) { setBusy(false); await send(data.text, "voix"); }
      } catch { if (alive.current && currentOperation === operation.current) { setNotice("La transcription principale est indisponible. Répétez votre demande avec le micro de secours."); browserListen(); } }
      finally { if (alive.current) { setBusy(false); if (!locked.current) setStage(""); } }
    };
    capture.start(250); setListening(true); setStage("");
    try {
      ctx = new AudioContext(); await ctx.resume();
      if (currentOperation !== operation.current || capture.state !== "recording") { cleanup(); return; }
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      poll = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        if (rms > 0.012) { heard = true; lastVoice = Date.now(); }
        if (capture.state === "recording" && ((heard && Date.now() - lastVoice > 1200) || (!heard && Date.now() - lastVoice > 8000))) capture.stop();
      }, 100);
    } catch { if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {}); ctx = undefined; }
  }
  async function listen() {
    if (listening) { if (recorder.current?.state === "recording") recorder.current.stop(); recognition.current?.stop(); return; }
    if (busy || loading || paused) return;
    setError(""); setNotice(""); stopSpeaking();
    if (!sessionRef.current) { setError("Votre session Senior est absente ou expirée. Reconnectez-vous pour activer le micro."); return; }
    if (!sessionRef.current.consentAI) { setError("Les services IA sont désactivés dans votre profil."); return; }
    if (!sessionRef.current.llm) { setError("Le dialogue IA n’est pas configuré. Demandez à l’administrateur de vérifier les services IA."); return; }
    setBusy(true);
    try { if (sessionRef.current.whisper && typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") await recordWhisper(); else browserListen(); }
    catch { setError("Impossible d’accéder au microphone. Vérifiez son autorisation ou écrivez dans Messages."); }
    finally { if (alive.current) setBusy(false); }
  }
  function setRemember(value: boolean) {
    setRememberState(value);
    if (sessionRef.current) try { localStorage.setItem(`careai_f1_remember_${sessionRef.current.senior._id}`, String(value)); } catch {}
  }
  async function forget() {
    if (busy || listening || locked.current) return;
    setBusy(true); setError(""); stopSpeaking();
    try { await request("/memory", undefined, "DELETE"); setMessages([]); setDraft(""); setNotice("Votre mémoire et votre conversation ont été effacées."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Effacement impossible."); }
    finally { setBusy(false); }
  }
  return { session, loading, messages, draft, setDraft, error, notice, stage, busy, listening, remember, setRemember, listen, send, speak, forget, stop, action, executeAction };
}
export type SeniorAssistant = ReturnType<typeof useSeniorAssistant>;
