"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AudioLines, MessageSquare, Mic, Send, Settings2, Sparkles, UserRound, Volume2 } from "lucide-react";
import { cx } from "@/components/ui";
import type { SeniorAssistant } from "@/lib/assistant/useSeniorAssistant";
import { AssistantAction } from "./AssistantAction";

export function MessagesPanel({ assistant, paused }: { assistant: SeniorAssistant; paused: boolean }) {
  const history = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const log = history.current; if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" }); }, [assistant.messages, assistant.busy]);
  useEffect(() => { const field = input.current; if (field) { field.style.height = "auto"; field.style.height = `${Math.min(Math.max(field.scrollHeight, 160), 320)}px`; } }, [assistant.draft]);
  const lastReply = [...assistant.messages].reverse().find((turn) => turn.role === "assistant")?.content;
  const disabled = assistant.loading || assistant.busy || paused;

  return <section aria-label="Chatbot CareAI" className="mt-6 overflow-hidden rounded-[28px] border border-brand-200 bg-white shadow-card">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-100 p-5 sm:px-7">
      <div className="flex items-center gap-4"><span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white"><Sparkles className="h-8 w-8" aria-hidden="true" /><span className={cx("absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-white", assistant.session ? "bg-ok-600" : "bg-slate-400")} /></span>
        <div><h2 className="text-[26px] font-extrabold text-brand-900">CareAI · votre assistant</h2><p className="text-[22px] text-ink">{assistant.loading ? "Ouverture de votre conversation…" : assistant.session ? "À votre écoute" : "Connectez-vous pour discuter"}</p></div>
      </div>
      {lastReply && <button type="button" disabled={disabled || assistant.listening} onClick={() => void assistant.speak(lastReply)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 text-[22px] font-bold text-brand-900 disabled:opacity-50"><Volume2 className="h-6 w-6" aria-hidden="true" />Réécouter</button>}
    </header>

    <div ref={history} role="log" aria-label="Historique de la conversation" aria-live="polite" aria-relevant="additions" tabIndex={0} className="h-[clamp(28rem,62dvh,52rem)] space-y-7 overflow-y-auto overscroll-contain bg-[#f3f6fc] p-4 [scrollbar-gutter:stable] sm:p-7">
      {!assistant.messages.length && <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-800"><MessageSquare className="h-10 w-10" aria-hidden="true" /></span>
        <h3 className="mt-5 text-[30px] font-extrabold text-brand-900">Un moment pour discuter</h3>
        <p className="mt-4 text-[22px] leading-relaxed text-ink">Posez une question, racontez votre journée ou retrouvez une information que vous m’avez confiée.</p>
        {!assistant.loading && !assistant.session && <Link href="/connexion?espace=senior" className="mt-6 flex min-h-16 items-center rounded-2xl bg-brand-700 px-6 text-[22px] font-bold text-white">Me connecter comme Senior</Link>}
      </div>}
      {assistant.messages.map((turn, index) => <div key={index} className={cx("flex items-end gap-3", turn.role === "user" && "flex-row-reverse")}>
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-200 bg-white text-brand-800 sm:flex" aria-hidden="true">{turn.role === "user" ? <UserRound className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}</span>
        <div className={cx("max-w-[96%] rounded-3xl px-5 py-5 sm:max-w-[90%] sm:px-7", turn.role === "user" ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md border border-brand-100 bg-white text-ink shadow-sm")}>
          <p className="mb-2 text-[22px] font-extrabold">{turn.role === "user" ? "Vous" : "CareAI"}</p><p className="max-w-[65ch] whitespace-pre-wrap break-words text-[22px] leading-[1.65]">{turn.content}</p>
          {turn.sourceUrl === "https://open-meteo.com/" && <><p className="mt-3 text-[20px]">Date des prévisions : {turn.weatherDate}</p><a href={turn.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[20px] font-bold text-brand-800 underline">Source météo : Open-Meteo</a></>}
        </div>
      </div>)}
      {assistant.busy && <p role="status" className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-[22px] font-semibold text-brand-900"><span className="motion-safe:animate-pulse" aria-hidden="true">•••</span>{assistant.stage || "Votre assistant prépare sa réponse…"}</p>}
    </div>

    <div className="space-y-4 border-t border-brand-100 bg-white p-5 sm:p-6">
      <AssistantAction assistant={assistant} paused={paused} />
      {assistant.error && <p role="alert" className="text-[22px] font-semibold text-red-900">{assistant.error}</p>}
      {assistant.notice && <p role="status" className="text-[22px] text-ink">{assistant.notice}</p>}
      {assistant.listening && <p role="status" className="flex items-center gap-3 text-[22px] font-bold text-brand-900"><AudioLines className="h-7 w-7" />Je vous écoute… Appuyez sur Terminer lorsque vous avez fini.</p>}
      <form onSubmit={(event) => { event.preventDefault(); void assistant.send(); }} className="space-y-3">
        <label className="block text-[22px] font-bold text-brand-900">Votre message<textarea ref={input} value={assistant.draft} onChange={(event) => assistant.setDraft(event.target.value)} rows={4} required maxLength={2000} placeholder="Écrivez votre message ici…" disabled={disabled || assistant.listening} className="mt-2 block min-h-40 max-h-80 w-full resize-none rounded-2xl border-2 border-brand-200 bg-white px-4 py-4 text-[22px] font-normal leading-relaxed text-ink placeholder:text-muted focus-visible:outline-brand-800 disabled:opacity-60" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={disabled} aria-pressed={assistant.listening} onClick={() => void assistant.listen()} className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 text-[22px] font-bold text-brand-900 disabled:opacity-50"><Mic className="h-7 w-7" aria-hidden="true" />{assistant.listening ? "Terminer" : "Dicter"}</button>
          <button type="submit" disabled={disabled || assistant.listening || !assistant.draft.trim()} className="ml-auto flex min-h-16 items-center gap-3 rounded-2xl bg-brand-700 px-6 text-[22px] font-bold text-white disabled:opacity-50">Envoyer<Send className="h-6 w-6" aria-hidden="true" /></button>
        </div>
      </form>
      <details className="border-t border-line pt-2 text-[22px] text-ink"><summary className="flex min-h-16 cursor-pointer items-center gap-3 font-bold text-brand-900"><Settings2 className="h-6 w-6" aria-hidden="true" />Mémoire et confidentialité</summary>
        <div className="space-y-4 py-3">
          <label className="flex min-h-16 items-center gap-4"><input type="checkbox" checked={assistant.remember} onChange={(event) => assistant.setRemember(event.target.checked)} disabled={disabled || assistant.listening || !assistant.session} className="h-8 w-8 shrink-0 accent-brand-700" />J’autorise l’assistant à retenir les faits personnels utiles que je lui confie.</label>
          <p>Les échanges récents sont conservés 24 heures. Les faits autorisés restent mémorisés jusqu’à leur effacement. La reconnaissance et la lecture vocales utilisent des services en ligne.</p>
          <button type="button" disabled={disabled || assistant.listening || !assistant.session} onClick={() => void assistant.forget()} className="min-h-16 rounded-2xl border-2 border-brand-900 px-5 font-bold text-brand-900 disabled:opacity-50">Effacer ma mémoire et mes échanges</button>
        </div>
      </details>
    </div>
  </section>;
}
