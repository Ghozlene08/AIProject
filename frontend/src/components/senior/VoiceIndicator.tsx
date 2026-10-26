"use client";

/**
 * Indicateur vocal commun aux pages Senior : le senior sait toujours ce que fait l'assistant.
 *  - "speaking"   : l'assistant parle → barres sonores animées ;
 *  - "listening"  : à lui de parler → micro ROUGE, l'anneau grandit avec sa voix ;
 *  - "processing" : l'assistant réfléchit → roue de chargement ;
 *  - "idle"       : en attente → micro bleu (le toucher repose la question).
 */
import { Loader2, Mic } from "lucide-react";
import { cx } from "@/components/ui";

export type VoiceMode = "idle" | "speaking" | "listening" | "processing";

export function VoiceIndicator({
  mode,
  level,
  statusText,
  onTap,
  tapLabel = "Me reposer la question et répondre à voix haute",
}: {
  mode: VoiceMode;
  /** Volume de la voix du senior (0 à 1) */
  level: number;
  statusText: string;
  onTap: () => void;
  tapLabel?: string;
}) {
  const listening = mode === "listening";
  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={onTap} aria-label={tapLabel} className="relative flex h-28 w-28 items-center justify-center rounded-full">
        <span
          className={cx("absolute inset-0 rounded-full transition-transform duration-100", listening ? "bg-danger-500/20" : "bg-brand-100/70")}
          style={{ transform: `scale(${listening ? 1 + level * 0.35 : 1})` }}
          aria-hidden="true"
        />
        <span
          className={cx(
            "relative z-10 flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-colors active:scale-95",
            listening ? "bg-danger-500 shadow-danger-500/40" : "bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-600/40",
          )}
        >
          {mode === "processing" ? <Loader2 className="h-10 w-10 animate-spin" aria-hidden="true" /> : <Mic className="h-10 w-10" aria-hidden="true" />}
        </span>
      </button>

      {/* Barres sonores pendant que l'assistant parle */}
      <div className="mt-2 flex h-7 items-end gap-1.5" aria-hidden="true">
        {mode === "speaking" &&
          [0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="w-2 animate-bounce rounded-full bg-brand-500" style={{ height: `${[12, 22, 28, 20, 10][i]}px`, animationDelay: `${i * 0.12}s` }} />
          ))}
      </div>

      {/* État de l'assistant, annoncé aux lecteurs d'écran */}
      <p aria-live="polite" className={cx("min-h-8 text-[22px] font-extrabold", listening ? "text-danger-600" : "text-brand-700")}>
        {statusText}
      </p>
    </div>
  );
}
