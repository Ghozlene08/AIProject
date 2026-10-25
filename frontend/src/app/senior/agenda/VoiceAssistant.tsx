"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Keyboard, Loader2, Mic, Send, X } from "lucide-react";
import { cx } from "@/components/ui";
import { speak, stopSpeaking, useVoiceCapture, type Capture } from "@/components/senior/voice";
import { type Proposal, type VoiceResponse, seniorApi } from "@/lib/seniorApi";
import { playListenStart, playListenStop } from "@/lib/senior/sounds";

type Phase = "listening" | "thinking" | "speaking" | "idle";
type Pending = { kind: "confirmation"; proposal: Proposal } | { kind: "clarification"; context: NonNullable<VoiceResponse["context"]> } | null;
interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = ["Qu'ai-je prévu aujourd'hui ?", "Rappelle-moi de prendre mon médicament à 20 heures", "Qu'est-ce que j'ai demain ?"];

/**
 * Assistant vocal de l'agenda (F2).
 * Écoute → transcription (Whisper, sinon reconnaissance du navigateur) → compréhension (LLM gratuit)
 * → réponse lue à voix haute. Après une question de l'assistant, l'écoute reprend automatiquement.
 */
export function VoiceAssistant({ onClose, onAgendaChange }: { onClose: () => void; onAgendaChange: () => void }) {
  const { listen, stop, level, interim } = useVoiceCapture();
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Je vous écoute. Dites par exemple : « Rappelle-moi d'appeler ma fille demain à 10 heures »." },
  ]);
  const [pending, setPending] = useState<Pending>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const pendingRef = useRef<Pending>(null);
  const closed = useRef(false);
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const say = (text: string) => setMessages((m) => [...m, { role: "assistant", text }]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim]);

  // Transcription : Whisper d'abord, reconnaissance du navigateur en secours
  async function transcribe(capture: Capture): Promise<{ text: string; stt: string } | null> {
    if (capture.blob && capture.blob.size > 2000) {
      try {
        // Route commune de l'équipe ; l'indice de vocabulaire aide Whisper sur les demandes d'agenda
        const hint = encodeURIComponent("rappel, rendez-vous, médicament, aujourd'hui, demain, heures, midi");
        const res = await seniorApi.audio<{ text: string }>(`/stt?module=agenda&hint=${hint}`, capture.blob);
        if (res.text) return { text: res.text, stt: "whisper" };
      } catch {
        /* bascule sur le navigateur */
      }
    }
    return capture.browserText ? { text: capture.browserText, stt: "webspeech" } : null;
  }

  async function handle(text: string, stt: string) {
    setMessages((m) => [...m, { role: "user", text }]);
    setPhase("thinking");
    const p = pendingRef.current;
    let res: VoiceResponse;
    try {
      res =
        p?.kind === "confirmation"
          ? await seniorApi.post<VoiceResponse>("/voice/confirm", { proposal: p.proposal, answer: text })
          : await seniorApi.post<VoiceResponse>("/voice/agenda", { text, stt, context: p?.kind === "clarification" ? p.context : undefined });
    } catch (err) {
      say((err as Error).message);
      setPhase("idle");
      return;
    }
    await respond(res);
  }

  async function respond(res: VoiceResponse) {
    const next: Pending =
      res.status === "confirmation" && res.proposal
        ? { kind: "confirmation", proposal: res.proposal }
        : res.status === "clarification" && res.context
          ? { kind: "clarification", context: res.context }
          : null;
    pendingRef.current = next;
    setPending(next);
    say(res.speech);
    if (res.event || res.intent === "confirmer_prise") onAgendaChange();
    setPhase("speaking");
    await speak(res.speech);
    if (closed.current) return;
    // Une question a été posée : on écoute la réponse
    if (next && !typing) turn();
    else setPhase("idle");
  }

  async function turn() {
    stopSpeaking();
    setPhase("listening");
    let capture: Capture;
    try {
      await playListenStart(); // signal sonore commun de l'équipe : « à vous ! »
      capture = await listen();
      playListenStop();
    } catch {
      setTyping(true);
      say("Je n'ai pas accès au micro. Vous pouvez écrire votre demande ci-dessous.");
      setPhase("idle");
      return;
    }
    if (closed.current) return;
    setPhase("thinking");
    const result = await transcribe(capture);
    if (!result) {
      const text = "Je n'ai pas bien entendu. Appuyez sur le micro et parlez un peu plus fort.";
      say(text);
      setPhase("speaking");
      await speak(text);
      setPhase("idle");
      return;
    }
    await handle(result.text, result.stt);
  }

  async function answer(confirmed: boolean) {
    const p = pendingRef.current;
    if (p?.kind !== "confirmation") return;
    stop();
    stopSpeaking();
    setMessages((m) => [...m, { role: "user", text: confirmed ? "Oui, c'est ça" : "Non" }]);
    setPhase("thinking");
    try {
      await respond(await seniorApi.post<VoiceResponse>("/voice/confirm", { proposal: p.proposal, confirmed }));
    } catch (err) {
      say((err as Error).message);
      setPhase("idle");
    }
  }

  // L'écoute démarre à l'ouverture (une seule fois, même en mode strict de React)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = window.setTimeout(() => turn(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    closed.current = true;
    stop();
    stopSpeaking();
    onClose();
  }

  function submitText(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || phase === "thinking") return;
    setDraft("");
    stop();
    handle(text, "texte");
  }

  const status = {
    listening: "Je vous écoute…",
    thinking: "Je réfléchis…",
    speaking: "Je vous réponds…",
    idle: pending ? "Répondez-moi" : "Appuyez sur le micro pour parler",
  }[phase];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gradient-to-b from-brand-50 to-white" role="dialog" aria-modal="true" aria-label="Assistant vocal de l'agenda">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <p className="text-[24px] font-extrabold text-brand-900">Assistant agenda</p>
        <button onClick={close} className="flex min-h-16 items-center gap-2 rounded-2xl bg-white px-5 text-[20px] font-bold text-ink shadow-card hover:bg-canvas">
          <X className="h-7 w-7" /> Fermer
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto px-4 pb-4" aria-live="polite">
        {messages.map((m, i) => (
          <p
            key={i}
            className={cx(
              "max-w-[85%] rounded-3xl px-5 py-4 text-[22px] leading-snug",
              m.role === "assistant" ? "rounded-bl-md bg-white text-ink shadow-card" : "ml-auto rounded-br-md bg-brand-600 text-white",
            )}
          >
            {m.text}
          </p>
        ))}
        {phase === "listening" && interim && <p className="ml-auto max-w-[85%] rounded-3xl rounded-br-md bg-brand-100 px-5 py-4 text-[22px] italic text-brand-800">{interim}</p>}
      </div>

      {/* Commandes */}
      <div className="mx-auto w-full max-w-2xl px-4 pb-6">
        {pending?.kind === "confirmation" && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button onClick={() => answer(true)} className="flex min-h-20 items-center justify-center gap-2 rounded-3xl bg-ok-500 text-[26px] font-extrabold text-white hover:bg-ok-600">
              <Check className="h-8 w-8" strokeWidth={3} /> Oui, c&apos;est ça
            </button>
            <button onClick={() => answer(false)} className="flex min-h-20 items-center justify-center gap-2 rounded-3xl border-2 border-line bg-white text-[26px] font-extrabold text-ink hover:bg-canvas">
              <X className="h-8 w-8" /> Non
            </button>
          </div>
        )}

        <div className="flex flex-col items-center">
          <button
            onClick={() => (phase === "listening" ? stop() : turn())}
            disabled={phase === "thinking"}
            aria-label={phase === "listening" ? "J'ai fini de parler" : "Parler à l'assistant"}
            className="relative flex h-32 w-32 items-center justify-center rounded-full disabled:opacity-70"
          >
            <span className="absolute inset-0 rounded-full bg-brand-200 transition-transform duration-100" style={{ transform: `scale(${1 + (phase === "listening" ? level * 0.45 : 0)})` }} aria-hidden="true" />
            <span className={cx("relative z-10 flex h-28 w-28 items-center justify-center rounded-full text-white shadow-xl", phase === "listening" ? "bg-danger-500" : "bg-gradient-to-br from-brand-500 to-brand-700")}>
              {phase === "thinking" ? <Loader2 className="h-14 w-14 animate-spin" /> : <Mic className="h-14 w-14" />}
            </span>
          </button>
          <p className="mt-3 text-[24px] font-extrabold text-brand-700">{status}</p>
          {phase === "listening" && <p className="text-[19px] text-muted">Je m&apos;arrête quand vous avez fini de parler.</p>}
        </div>

        {/* Saisie écrite : secours si le micro n'est pas disponible */}
        {typing ? (
          <form onSubmit={submitText} className="mt-4 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Écrivez votre demande…"
              aria-label="Écrire votre demande"
              className="h-16 min-w-0 flex-1 rounded-2xl border-2 border-line bg-white px-4 text-[22px] text-ink focus:border-brand-400 focus:outline-none"
            />
            <button className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white" aria-label="Envoyer">
              <Send className="h-7 w-7" />
            </button>
          </form>
        ) : (
          <button onClick={() => setTyping(true)} className="mx-auto mt-3 flex min-h-14 items-center gap-2 rounded-2xl px-4 text-[19px] font-bold text-muted hover:bg-white">
            <Keyboard className="h-6 w-6" /> Écrire plutôt
          </button>
        )}
        {typing && !pending && (
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => handle(s, "texte")} disabled={phase === "thinking"} className="min-h-14 rounded-2xl bg-white px-4 text-left text-[18px] font-semibold text-brand-700 shadow-card hover:bg-brand-50">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
