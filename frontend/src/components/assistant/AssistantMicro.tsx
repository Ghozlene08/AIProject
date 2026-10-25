"use client";

import Link from "next/link";
import { Mic } from "lucide-react";
import { cx } from "@/components/ui";
import type { SeniorAssistant } from "@/lib/assistant/useSeniorAssistant";
import { AssistantAction } from "./AssistantAction";

export function AssistantMicro({ assistant, paused }: { assistant: SeniorAssistant; paused: boolean }) {
  const reply = assistant.messages.at(-1);
  return <section aria-label="Assistant vocal à mémoire" className="mt-8 flex flex-col items-center">
    <button type="button" onClick={() => void assistant.listen()} disabled={assistant.loading || assistant.busy || paused} aria-pressed={assistant.listening} aria-label={assistant.listening ? "Terminer ma demande" : "Parler à l’assistant"}
      className={cx("relative flex h-40 w-40 items-center justify-center rounded-full disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-900", assistant.listening && "pulse-ring text-brand-300")}>
      <span className="absolute inset-0 rounded-full bg-brand-100/70" aria-hidden="true" />
      <span className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/30"><Mic className="h-16 w-16" aria-hidden="true" /></span>
    </button>
    <p role="status" className="mt-5 text-center text-[26px] font-extrabold text-brand-900">{paused ? "Votre assistant est en pause" : assistant.listening ? "Je vous écoute…" : assistant.stage || (assistant.busy ? "Un instant…" : "Parlez maintenant")}</p>
    <p className="text-center text-[22px] text-ink">Dites votre demande, naturellement…</p>
    {reply?.role === "assistant" && <div className="mt-5 w-full max-w-3xl rounded-3xl border border-brand-200 bg-white p-5 text-[22px] leading-relaxed text-ink shadow-sm"><p>{reply.content}</p>{reply.sourceUrl === "https://open-meteo.com/" && <><p className="mt-3 text-[20px]">Date des prévisions : {reply.weatherDate}</p><a href={reply.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold text-brand-800 underline">Source météo : Open-Meteo</a></>}</div>}
    <AssistantAction assistant={assistant} paused={paused} />
    {assistant.error && <p role="alert" className="mt-4 max-w-2xl text-center text-[22px] font-semibold text-red-900">{assistant.error}</p>}
    {assistant.notice && <p role="status" className="mt-4 max-w-2xl text-center text-[22px] text-ink">{assistant.notice}</p>}
    {!assistant.loading && !assistant.session && <Link href="/connexion?espace=senior" className="mt-4 flex min-h-16 items-center rounded-2xl bg-brand-700 px-6 text-[22px] font-bold text-white">Me connecter comme Senior</Link>}
  </section>;
}
