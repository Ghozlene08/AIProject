"use client";

import { useEffect, useRef } from "react";
import { Mic, Send, Sparkles, Volume2, Settings2, MessageSquare, UserRound, AudioLines } from "lucide-react";
import { cx } from "@/components/ui";
import type { VoiceController } from "./useVoiceAssistant";

export function MessagesPanel({ voice }: { voice: VoiceController }) {
  const history = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const log = history.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [voice.messages, voice.busy]);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 180), 320)}px`;
  }, [voice.transcript]);
  const lastReply = [...voice.messages].reverse().find((message) => message.role === "assistant")?.content;

  return <section aria-label="Conversation avec votre assistant" className="mt-6 overflow-hidden rounded-[28px] border border-brand-200 bg-white shadow-[0_12px_48px_-24px_rgba(15,42,92,0.28)]">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-white px-5 py-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-4">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-700/15"><Sparkles className="h-8 w-8" aria-hidden="true" /><span className={cx("absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-white", voice.connected ? "bg-ok-600" : "bg-slate-400")} /></span>
        <div><h2 className="text-[24px] font-extrabold tracking-tight text-brand-900">CareAI <span className="font-normal text-muted">· votre assistant</span></h2><p className="mt-0.5 text-[22px] text-ink">{voice.restoring ? "Ouverture…" : voice.connected ? "À votre écoute" : "Bienvenue dans votre messagerie"}</p></div>
      </div>
      {lastReply && <button type="button" disabled={voice.busy || voice.listening} onClick={() => void voice.speak(lastReply)} className="flex min-h-16 items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 text-[22px] font-bold text-brand-900 transition-colors hover:bg-brand-100 disabled:opacity-50"><Volume2 className="h-6 w-6" aria-hidden="true" />Réécouter</button>}
    </header>

    <div ref={history} role="log" aria-label="Historique des messages" aria-live="polite" aria-relevant="additions" tabIndex={0} className="h-[clamp(30rem,68dvh,56rem)] space-y-7 overflow-y-auto overscroll-contain bg-[#f3f6fc] p-4 [scrollbar-gutter:stable] sm:px-8 sm:py-8">
      {voice.messages.length > 0 && <p className="mx-auto w-fit rounded-full border border-brand-100 bg-white px-5 py-1 text-center text-[22px] text-muted">Votre conversation</p>}
      {!voice.messages.length && <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100/70 text-brand-700"><MessageSquare className="h-9 w-9" aria-hidden="true" /></span>
        <h3 className="mt-5 text-[28px] font-extrabold text-brand-900">Un moment pour discuter</h3>
        <p className="mt-3 text-[22px] leading-relaxed text-ink">Posez une question, racontez votre journée ou retrouvez une information que vous m’avez confiée.</p>
        {!voice.connected && !voice.restoring && <button type="button" onClick={() => voice.setLoginOpen(true)} className="mt-6 min-h-16 rounded-2xl bg-brand-700 px-6 text-[22px] font-bold text-white">Connecter mon profil</button>}
      </div>}
      {voice.messages.map((message, index) => <div key={index} className={cx("flex items-end gap-3", message.role === "user" ? "flex-row-reverse" : "flex-row")}>
        <span aria-hidden="true" className={cx("mb-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:flex", message.role === "user" ? "bg-brand-100 text-brand-800" : "border border-brand-100 bg-white text-brand-700")}>{message.role === "user" ? <UserRound className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}</span>
        <div className={cx("max-w-[96%] rounded-[24px] px-5 py-5 sm:max-w-[90%] sm:px-7", message.role === "user" ? "rounded-br-md bg-brand-700 text-white shadow-sm" : "rounded-bl-md border border-line bg-white text-ink shadow-[0_2px_8px_rgba(15,42,92,0.03)]")}>
          <p className={cx("mb-2 text-[22px] font-extrabold", message.role === "user" ? "text-white" : "text-brand-700")}>{message.role === "user" ? "Vous" : "CareAI"}</p>
          <p className="max-w-[60ch] whitespace-pre-wrap break-words text-[22px] leading-[1.65]">{message.content}</p>
        </div>
      </div>)}
      {voice.busy && <div role="status" className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-[22px] font-semibold text-brand-900"><span className="flex gap-1.5 motion-safe:animate-pulse" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-brand-500" /><span className="h-2 w-2 rounded-full bg-brand-500" /><span className="h-2 w-2 rounded-full bg-brand-500" /></span>{voice.stage || "CareAI prépare sa réponse…"}</div>}
    </div>

    <div className="shrink-0 space-y-3 border-t border-brand-100 bg-white p-4 sm:px-6 sm:py-4">
      {voice.error && <p role="alert" className="text-[22px] font-semibold text-red-900">{voice.error}</p>}
      {voice.listening && <p role="status" className="flex items-center gap-3 text-[22px] font-bold text-brand-900"><AudioLines className="h-6 w-6 motion-safe:animate-pulse" aria-hidden="true" />Je vous écoute… Appuyez sur le micro pour terminer.</p>}
      <form onSubmit={(event) => { event.preventDefault(); void voice.send(voice.transcript); }} className="space-y-3">
        <label className="block w-full text-[22px] font-bold text-brand-900">Votre message<textarea ref={composer} value={voice.transcript} onChange={(event) => voice.setTranscript(event.target.value)} placeholder="Écrivez votre message ici…" maxLength={2000} required disabled={voice.busy || voice.listening || voice.restoring} rows={4} className="mt-2 block min-h-[180px] max-h-80 w-full resize-none rounded-2xl border-2 border-brand-200 bg-white px-4 py-4 text-[22px] font-normal leading-relaxed text-ink placeholder:text-muted focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => void voice.listen()} disabled={voice.busy || voice.restoring} aria-pressed={voice.listening} aria-label={voice.listening ? "Arrêter l’écoute" : "Dicter mon message"} className={cx("flex min-h-16 shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-[22px] font-bold transition-colors disabled:opacity-50", voice.listening ? "bg-brand-700 text-white" : "border border-brand-200 bg-brand-50 text-brand-900 hover:bg-brand-100")}><Mic className="h-7 w-7" aria-hidden="true" /><span className="hidden sm:inline">{voice.listening ? "Terminer" : "Dicter"}</span></button>
        <button type="submit" aria-label="Envoyer mon message" disabled={voice.busy || voice.listening || voice.restoring || !voice.transcript.trim()} className="ml-auto flex h-16 shrink-0 items-center justify-center gap-3 rounded-2xl bg-brand-700 px-6 text-[22px] font-bold text-white transition-colors hover:bg-brand-800 disabled:bg-brand-100 disabled:text-brand-800"><span>Envoyer</span><Send className="h-6 w-6" aria-hidden="true" /></button>
        </div>
      </form>
      <details className="max-h-64 overflow-y-auto text-[22px] text-ink"><summary className="flex min-h-16 cursor-pointer items-center gap-2 font-bold text-brand-900"><Settings2 className="h-6 w-6" aria-hidden="true" />Mémoire et préférences</summary>
        <div className="space-y-4 pt-3">
          <label className="flex min-h-16 items-center gap-4"><input type="checkbox" checked={voice.remember} disabled={!voice.connected || voice.busy || voice.listening} onChange={(event) => voice.setRemember(event.target.checked)} className="h-7 w-7 shrink-0 accent-brand-700" />Autoriser la mémorisation des faits utiles que je confie à l’assistant.</label>
          <p>Les échanges récents sont conservés 24 heures. Vous pouvez effacer les faits retenus et la conversation.</p>
          <button type="button" disabled={!voice.connected || voice.busy || voice.listening} onClick={() => void voice.forget()} className="min-h-16 rounded-2xl border-2 border-brand-900 px-5 font-bold text-brand-900 disabled:opacity-50">Effacer ma mémoire</button>
          {voice.connected && <button type="button" disabled={voice.busy || voice.listening} onClick={() => void voice.disconnect()} className="ml-3 min-h-16 rounded-2xl px-5 font-bold text-danger-600 disabled:opacity-50 lg:hidden">Se déconnecter</button>}
        </div>
      </details>
    </div>
  </section>;
}
