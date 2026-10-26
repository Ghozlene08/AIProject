"use client";

/**
 * Interface Senior — Souvenirs : choix « Écouter » ou « Raconter » (module F4).
 * URL : /senior/souvenirs
 *
 * Déroulé :
 *  1. l'assistant demande à voix haute : « Voulez-vous écouter un souvenir, ou en raconter un ? » ;
 *  2. un signal sonore (« ding-ding ») annonce que le micro écoute : le senior répond « écouter »
 *     ou « raconter » ; il peut aussi toucher l'un des deux gros boutons (oreille / bouche qui parle) ;
 *  3. l'assistant confirme puis redirige vers /senior/souvenirs/ecouter ou /senior/souvenirs/raconter.
 * Si la réponse n'est pas comprise, l'assistant repose la question (2 fois au maximum),
 * puis invite à toucher un bouton. Jamais de message d'erreur technique pour le senior.
 *
 * La question est reposée à CHAQUE affichage de la page (y compris au retour depuis une autre page).
 * Accessibilité (cahier des charges) : texte ≥ 22 px, boutons ≥ 64 px, 4 actions par écran au maximum.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ear, Speech } from "lucide-react";
import { cx } from "@/components/ui";
import { SeniorHeader } from "@/components/senior/SeniorHeader";
import { VoiceIndicator, type VoiceMode } from "@/components/senior/VoiceIndicator";
import { cachedSenior, ensureSeniorSession } from "@/lib/senior/api";
import { speak, stopSpeaking } from "@/lib/senior/speech";
import { useVoiceInput } from "@/lib/senior/useVoiceInput";
import { detectChoice, type MemoryChoice } from "@/lib/souvenirs/voiceIntent";

const MAX_ATTEMPTS = 2; // nombre de fois où l'assistant repose la question
const ROUTES: Record<MemoryChoice, string> = { ecouter: "/senior/souvenirs/ecouter", raconter: "/senior/souvenirs/raconter" };
const CONFIRM: Record<MemoryChoice, string> = { ecouter: "Très bien, écoutons un souvenir.", raconter: "Très bien, je vous écoute." };

// Ce qui est affiché sous la question, selon l'étape
type Phase = "loading" | "needTap" | "speaking" | "listening" | "processing" | "waiting" | "going";

const STATUS_TEXT: Record<Phase, string> = {
  loading: "Un instant…",
  needTap: "Touchez le micro pour commencer.",
  speaking: "L'assistant vous parle…",
  listening: "À vous ! Je vous écoute…",
  processing: "Je réfléchis…",
  waiting: "Touchez un bouton, ou le micro pour répondre à voix haute.",
  going: "C'est parti !",
};

export default function SeniorSouvenirsPage() {
  const router = useRouter();
  const { status, error: micError, level, listen, cancel } = useVoiceInput();
  const [firstName, setFirstName] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [heard, setHeard] = useState<string | null>(null);

  /* Numéro de la « séance » en cours. Il change à chaque affichage de la page et quand on la quitte :
   * une séance remplacée s'arrête d'elle-même (plus de voix ni d'écoute qui continuent en arrière-plan). */
  const run = useRef(0);
  const isCurrent = (id: number) => run.current === id;

  // Redirection vers le choix du senior (à la voix ou au bouton)
  const go = useCallback(
    async (choice: MemoryChoice) => {
      const id = ++run.current; // arrête la séance de questions en cours
      cancel();
      setPhase("going");
      await Promise.race([speak(CONFIRM[choice]), new Promise((r) => setTimeout(r, 2500))]);
      if (isCurrent(id)) router.push(ROUTES[choice]);
    },
    [cancel, router],
  );

  // Pose la question, écoute la réponse, et recommence si elle n'est pas comprise
  const ask = useCallback(
    async (name: string, greet: boolean) => {
      const id = ++run.current;
      setHeard(null);
      for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
        setPhase("speaking");
        const text =
          attempt === 0
            ? `${greet && name ? `Bonjour ${name}. ` : ""}Voulez-vous écouter un souvenir, ou en raconter un ?`
            : "Je n'ai pas bien entendu. Dites « écouter », ou « raconter ».";
        const result = await speak(text);
        if (!isCurrent(id)) return;
        if (result === "blocked") return setPhase("needTap"); // le navigateur attend un premier toucher

        setPhase("listening");
        const { text: answer, micError } = await listen({ module: "souvenirs", hint: "écouter, raconter, un souvenir" });
        if (!isCurrent(id)) return;
        // Micro refusé ou absent : inutile de reposer la question, on propose les boutons
        if (micError) return setPhase("waiting");
        setHeard(answer);
        const choice = detectChoice(answer);
        if (choice) return go(choice);
      }
      // Toujours pas compris : on invite à utiliser les boutons, sans insister
      setPhase("waiting");
      await speak("Vous pouvez aussi toucher l'un des deux grands boutons.");
    },
    [listen, go],
  );

  // À CHAQUE affichage de la page : la question est posée (avec le prénom gardé de la dernière visite),
  // pendant que la session du senior (démo pour l'instant) est vérifiée sans faire attendre.
  // En quittant la page : la voix et le micro s'arrêtent.
  useEffect(() => {
    const cached = cachedSenior();
    const startId = run.current;
    const session = ensureSeniorSession().then((s) => {
      setFirstName(s.firstName);
      return s;
    });
    // Lance la question seulement si la page n'a pas été quittée entre-temps
    const start = (name: string) => {
      if (run.current === startId) ask(name, true);
    };
    if (cached) {
      Promise.resolve().then(() => {
        setFirstName(cached.firstName);
        start(cached.firstName);
      });
    } else {
      session.then((s) => start(s.firstName)).catch(() => start(""));
    }

    return () => {
      run.current++; // la séance en cours s'arrête
      stopSpeaking();
      cancel();
      setPhase("loading"); // au retour sur la page, on repart de zéro (et non de « C'est parti ! »)
    };
  }, [ask, cancel]);

  // Le bouton micro repose la question et rouvre l'écoute
  const restart = () => {
    if (status !== "idle" || phase === "going") return;
    ask(firstName, false);
  };

  const mode: VoiceMode =
    status === "processing" || phase === "processing" ? "processing" : phase === "listening" ? "listening" : phase === "speaking" ? "speaking" : "idle";
  const question = `${firstName ? `${firstName}, v` : "V"}oulez-vous écouter un souvenir, ou en raconter un ?`;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-canvas">
      <SeniorHeader />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pt-6 pb-8 text-center sm:px-8">
        {/* La question, aussi affichée en gros pour ceux qui entendent mal */}
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-brand-900 sm:text-[32px]">{question}</h1>

        {/* Micro, barres sonores et état de l'assistant (composant commun aux pages Senior) */}
        <div className="mt-5">
          <VoiceIndicator mode={mode} level={level} statusText={STATUS_TEXT[phase]} onTap={restart} />
        </div>
        {heard && phase !== "going" && <p className="text-[22px] text-muted">Vous avez dit : « {heard} »</p>}
        {micError && (
          <p className="mt-2 rounded-2xl bg-warn-50 px-5 py-2 text-[22px] font-semibold text-warn-600">
            {micError === "micro_refuse" ? "Le micro n'est pas autorisé. Touchez un des deux boutons." : "Aucun micro trouvé. Touchez un des deux boutons."}
          </p>
        )}

        {/* Les deux choix : oreille = écouter, bouche qui parle = raconter */}
        <div className="mt-6 grid w-full gap-4 sm:grid-cols-2">
          <ChoiceButton icon={<Ear className="h-11 w-11" aria-hidden="true" />} label="Écouter un souvenir" tone="brand" onClick={() => go("ecouter")} />
          <ChoiceButton icon={<Speech className="h-11 w-11" aria-hidden="true" />} label="Raconter un souvenir" tone="violet" onClick={() => go("raconter")} />
        </div>
      </main>
    </div>
  );
}

function ChoiceButton({ icon, label, tone, onClick }: { icon: React.ReactNode; label: string; tone: "brand" | "violet"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl border-2 px-6 py-5 shadow-card transition-shadow hover:shadow-pop active:scale-[0.98]",
        tone === "brand" ? "border-brand-200 bg-brand-50" : "border-violet-500/20 bg-violet-50",
      )}
    >
      <span className={cx("flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg", tone === "brand" ? "bg-brand-600" : "bg-violet-500")}>
        {icon}
      </span>
      <span className="text-[24px] font-extrabold text-ink">{label}</span>
    </button>
  );
}
