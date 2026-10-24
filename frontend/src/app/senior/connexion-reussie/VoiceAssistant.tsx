"use client";

import { Mic } from "lucide-react";
import { cx } from "@/components/ui";
import type { VoiceController } from "./useVoiceAssistant";

export function VoiceAssistant({ voice }: { voice: VoiceController }) {
  return <section aria-label="Assistant vocal" className="mt-8 flex flex-col items-center">
    <button type="button" onClick={() => void voice.listen()} disabled={voice.busy || voice.restoring} aria-pressed={voice.listening}
      aria-label={voice.listening ? "Arrêter l’écoute" : "Parler à l’assistant"}
      className={cx("relative flex h-40 w-40 items-center justify-center rounded-full disabled:opacity-60 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-900", voice.listening ? "pulse-ring text-brand-300" : "")}>
      <span className="absolute inset-0 rounded-full bg-brand-100/70" aria-hidden="true" />
      <span className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/40 transition-transform active:scale-95">
        <Mic className="h-16 w-16" aria-hidden="true" />
      </span>
    </button>
    <p aria-live="polite" className="mt-5 text-center text-[26px] font-extrabold text-brand-700">{voice.listening ? "Je vous écoute…" : voice.restoring ? "Ouverture de votre espace…" : voice.stage || (voice.busy ? "Un instant…" : "Parlez maintenant")}</p>
    <p className="text-center text-[22px] text-muted">Dites votre demande, naturellement…</p>
    {voice.error && <p role="alert" className="mt-4 max-w-xl text-center text-[22px] font-semibold text-red-900">{voice.error}</p>}
  </section>;
}
