"use client";

/**
 * Interface Senior — Souvenirs : écoute d'un souvenir, comme une petite vidéo (module F4).
 * URL : /senior/souvenirs/ecouter/[id]
 *
 * Déroulé :
 *  1. le récit est découpé en phrases ; l'assistant les lit une par une à voix haute ;
 *  2. EN MÊME TEMPS, les photos ajoutées par l'aidant défilent en grand (fondu enchaîné + zoom lent),
 *     et la phrase lue s'affiche en sous-titre ; une barre montre l'avancement ;
 *  3. à la fin : « Voulez-vous que je vous pose quelques questions sur ce souvenir ? »
 *       - « oui » → le quiz (/senior/souvenirs/ecouter/[id]/quiz) ;
 *       - « non » → « À bientôt » puis retour à l'accueil du senior (/senior/connexion-reussie).
 * Le senior peut aussi répondre avec les boutons, mettre en pause ou réécouter depuis le début.
 * Mise en page « lecteur vidéo plein écran » : titre, sous-titres et boutons sont posés sur les photos.
 * Un récit écouté jusqu'au bout est compté dans les statistiques de l'aidant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookHeart, Check, MapPin, Pause, Play, RotateCcw, X } from "lucide-react";
import { cx } from "@/components/ui";
import { MemoryPhoto } from "@/components/souvenirs/MemoryPhoto";
import { SeniorHeader } from "@/components/senior/SeniorHeader";
import { VoiceIndicator, type VoiceMode } from "@/components/senior/VoiceIndicator";
import { ensureSeniorSession } from "@/lib/senior/api";
import { saysNo, saysYes } from "@/lib/senior/replies";
import { fetchMemory, fetchSeniorPhotoUrl, markListened, seniorPhotoPath, type SeniorMemory } from "@/lib/senior/souvenirs";
import { speak, stopSpeaking } from "@/lib/senior/speech";
import { useVoiceInput } from "@/lib/senior/useVoiceInput";

const HOME = "/senior/connexion-reussie?vue=accueil"; // accueil du senior (sans rejouer « Visage reconnu »)
const QUIZ_QUESTION = "Voulez-vous que je vous pose quelques questions sur ce souvenir ? C'est un petit jeu pour faire travailler la mémoire.";

type Phase = "loading" | "needTap" | "reading" | "paused" | "question" | "listening" | "waiting" | "leaving" | "error";

// Découpe le récit en phrases (lues une par une : les sous-titres et les photos suivent la voix)
function toSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export default function SeniorEcouterSouvenirPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, level, listen, cancel } = useVoiceInput();
  const [memory, setMemory] = useState<SeniorMemory | null>(null);
  const [sentences, setSentences] = useState<string[]>([]);
  const [index, setIndex] = useState(0); // phrase en cours de lecture
  const [phase, setPhase] = useState<Phase>("loading");
  const [heard, setHeard] = useState<string | null>(null);

  // Numéro de la « séance » en cours : une séance remplacée (pause, page quittée…) s'arrête d'elle-même
  const run = useRef(0);
  const isCurrent = (n: number) => run.current === n;
  const counted = useRef(false); // l'écoute n'est comptée qu'une fois

  /* --- Fin : oui → quiz, non → accueil --- */
  const leave = useCallback(
    async (to: "quiz" | "home") => {
      const n = ++run.current;
      cancel();
      setPhase("leaving");
      const words = to === "quiz" ? "Très bien, commençons le petit jeu." : "Très bien. À bientôt pour un autre souvenir.";
      await Promise.race([speak(words), new Promise((r) => setTimeout(r, 3000))]);
      if (isCurrent(n)) router.push(to === "quiz" ? `/senior/souvenirs/ecouter/${id}/quiz` : HOME);
    },
    [cancel, router, id],
  );

  /* --- Question du quiz, après le récit --- */
  const askQuiz = useCallback(async () => {
    const n = ++run.current;
    for (let attempt = 0; attempt < 2; attempt++) {
      setPhase("question");
      await speak(attempt === 0 ? QUIZ_QUESTION : "Je n'ai pas bien entendu. Dites « oui » pour jouer, ou « non » pour revenir à l'accueil.");
      if (!isCurrent(n)) return;
      setPhase("listening");
      const { text, micError } = await listen({ module: "souvenirs", hint: "oui, non" });
      if (!isCurrent(n)) return;
      if (micError) break;
      setHeard(text);
      if (saysYes(text)) return leave("quiz");
      if (saysNo(text)) return leave("home");
    }
    if (isCurrent(n)) setPhase("waiting"); // le senior répond avec les boutons
  }, [listen, leave]);

  /* --- Lecture du récit, phrase par phrase, à partir de « from » --- */
  const narrate = useCallback(
    async (all: string[], from: number) => {
      const n = ++run.current;
      for (let i = from; i < all.length; i++) {
        setIndex(i);
        setPhase("reading");
        const result = await speak(all[i], { rate: 0.85 });
        if (!isCurrent(n)) return; // pause, réécoute ou page quittée
        if (result === "blocked") return setPhase("needTap");
      }
      // Récit écouté jusqu'au bout : compté une fois dans les statistiques de l'aidant
      if (!counted.current) {
        counted.current = true;
        markListened(id);
      }
      askQuiz();
    },
    [askQuiz, id],
  );

  // À chaque affichage : on charge le souvenir puis la lecture commence. En quittant : silence.
  useEffect(() => {
    const startId = run.current;
    counted.current = false;
    ensureSeniorSession()
      .then(() => fetchMemory(id))
      .then(({ memory: m }) => {
        if (run.current !== startId) return;
        const parts = toSentences(m.recit || m.title);
        setMemory(m);
        setSentences(parts);
        narrate(parts, 0);
      })
      .catch(() => run.current === startId && setPhase("error"));

    return () => {
      run.current++;
      stopSpeaking();
      cancel();
      setPhase("loading");
      setHeard(null);
    };
  }, [id, narrate, cancel]);

  /* --- Boutons --- */
  const pause = () => {
    run.current++; // arrête la lecture après annulation de la phrase
    stopSpeaking();
    setPhase("paused");
  };
  const resume = () => narrate(sentences, index); // reprend à la phrase interrompue
  const replay = () => {
    stopSpeaking();
    cancel();
    setHeard(null);
    narrate(sentences, 0);
  };

  const photos = memory?.photos ?? [];
  // La photo affichée avance avec la lecture : les photos sont réparties sur l'ensemble des phrases
  const photoIndex = photos.length ? Math.min(photos.length - 1, Math.floor((index * photos.length) / Math.max(1, sentences.length))) : 0;
  const ended = ["question", "listening", "waiting", "leaving"].includes(phase);
  const progress = sentences.length ? ((ended ? sentences.length : index + (phase === "reading" ? 0.5 : 0)) / sentences.length) * 100 : 0;
  const mode: VoiceMode = status === "processing" ? "processing" : phase === "listening" ? "listening" : phase === "question" ? "speaking" : "idle";

  if (phase === "error") {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-canvas">
        <SeniorHeader backHref="/senior/souvenirs/ecouter" backLabel="Mes souvenirs" />
        <p className="mt-16 text-center text-[24px] font-bold text-ink">Ce souvenir n&apos;est pas disponible.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-black">
      <SeniorHeader backHref="/senior/souvenirs/ecouter" backLabel="Mes souvenirs" />

      {/* Lecteur plein écran (sous l'en-tête) : photos, titre, sous-titres et boutons posés sur l'image */}
      <main aria-label="Diaporama du souvenir" className="relative h-[calc(100vh-5rem)] w-full overflow-hidden bg-brand-900">
        {/* Photos en fondu enchaîné, avec un zoom lent (effet « Ken Burns ») */}
        {photos.length ? (
          photos.map((p, i) => (
            <div key={p._id} className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: i === photoIndex ? 1 : 0 }} aria-hidden={i !== photoIndex}>
              <div
                className="h-full w-full"
                style={{ transform: `scale(${i === photoIndex && phase === "reading" ? 1.1 : 1})`, transition: "transform 12s linear" }}
              >
                <MemoryPhoto path={seniorPhotoPath(id, p._id)} alt={`Photo ${i + 1} du souvenir ${memory?.title ?? ""}`} className="h-full w-full" load={fetchSeniorPhotoUrl} />
              </div>
            </div>
          ))
        ) : (
          // Pas de photo : un fond doux avec un cœur, pour garder l'effet « vidéo »
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-violet-500">
            <BookHeart className={cx("h-32 w-32 text-white/70", phase === "reading" && "animate-pulse")} aria-hidden="true" />
          </div>
        )}

        {/* Barre d'avancement, tout en haut */}
        <div className="absolute inset-x-0 top-0 z-10 h-2 bg-white/25" aria-hidden="true">
          <div className="h-full bg-white transition-[width] duration-700" style={{ width: `${progress}%` }} />
        </div>

        {/* Titre sur l'image, avec un dégradé sombre pour rester lisible */}
        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-6 pt-6 pb-16 sm:px-10">
          <h1 className="text-[28px] font-black leading-tight text-white drop-shadow sm:text-[34px]">{memory?.title ?? "Votre souvenir"}</h1>
          {(memory?.date || memory?.place) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[22px] font-semibold text-white/90">
              {memory?.date && <span>{memory.date}</span>}
              {memory?.place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-5 w-5" aria-hidden="true" /> {memory.place}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Pendant la lecture : sous-titre puis boutons ronds, en bas, sur un dégradé sombre */}
        {!ended && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-6 pt-20 pb-8">
            {sentences[index] && (
              <p aria-live="polite" className="max-w-4xl text-center text-[24px] font-bold leading-snug text-white drop-shadow sm:text-[26px]">
                {sentences[index]}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {phase === "paused" || phase === "needTap" ? (
                <PlayerButton onClick={resume} icon={<Play className="h-8 w-8" aria-hidden="true" />} label={phase === "needTap" ? "Écouter" : "Reprendre"} primary />
              ) : (
                <PlayerButton onClick={pause} icon={<Pause className="h-8 w-8" aria-hidden="true" />} label="Pause" primary disabled={phase !== "reading"} />
              )}
              <PlayerButton onClick={replay} icon={<RotateCcw className="h-8 w-8" aria-hidden="true" />} label="Réécouter" disabled={phase === "loading"} />
            </div>
          </div>
        )}

        {/* À la fin : la vidéo s'assombrit et la question du quiz apparaît dans une carte au centre */}
        {ended && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-4">
            <div className="fade-up w-full max-w-xl rounded-[28px] bg-white px-6 py-7 text-center shadow-pop sm:px-10">
              <p className="text-[26px] font-black leading-tight text-brand-900">Voulez-vous quelques questions sur ce souvenir ?</p>
              <p className="mt-1 text-[22px] text-muted">Un petit jeu pour faire travailler la mémoire.</p>
              <div className="mt-3">
                <VoiceIndicator
                  mode={mode}
                  level={level}
                  statusText={phase === "listening" ? "À vous ! Dites « oui » ou « non »." : phase === "leaving" ? "C'est parti !" : phase === "waiting" ? "Touchez « Oui » ou « Non »." : "L'assistant vous parle…"}
                  onTap={() => phase === "waiting" && askQuiz()}
                  tapLabel="Reposer la question"
                />
              </div>
              {heard && phase !== "leaving" && <p className="text-[22px] text-muted">Vous avez dit : « {heard} »</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <BigButton onClick={() => leave("quiz")} icon={<Check className="h-8 w-8" aria-hidden="true" />} label="Oui, jouons" primary disabled={phase === "leaving"} />
                <BigButton onClick={() => leave("home")} icon={<X className="h-8 w-8" aria-hidden="true" />} label="Non, merci" disabled={phase === "leaving"} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Bouton rond du lecteur, posé sur la photo : blanc (principal) ou translucide, toujours bien contrasté
function PlayerButton({ onClick, icon, label, primary, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex min-h-16 items-center justify-center gap-3 rounded-full px-8 text-[22px] font-extrabold shadow-lg backdrop-blur transition-colors disabled:opacity-50",
        primary ? "bg-white text-brand-800 hover:bg-brand-50" : "border-2 border-white/80 bg-white/15 text-white hover:bg-white/25",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function BigButton({ onClick, icon, label, primary, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl px-6 text-[22px] font-extrabold shadow-card transition-colors disabled:opacity-50",
        primary ? "bg-brand-600 text-white hover:bg-brand-700" : "border-2 border-brand-200 bg-white text-brand-700 hover:bg-brand-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
