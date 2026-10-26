"use client";

/**
 * Interface Senior — Souvenirs : quiz à voix haute sur un souvenir (module F4).
 * URL : /senior/souvenirs/ecouter/[id]/quiz
 *
 * Les questions viennent du souvenir saisi par l'aidant (générées par l'IA et validées).
 * L'assistant ANIME le jeu : il pose chaque question, écoute la réponse, encourage, aide.
 *   - bonne réponse            → « Bravo ! C'était « Sousse ». »
 *   - réponse proche/différente → JAMAIS « faux » : « Vous y êtes presque ! » / « Je vous donne un petit indice… »
 *   - après 2 indices           → il raconte la réponse avec douceur ;
 *   - « je ne sais pas »        → indice tout de suite ;   « passe » → question suivante.
 * C'est le SERVEUR qui juge les réponses (le navigateur ne connaît pas les réponses à l'avance).
 * Chaque réponse est enregistrée : l'aidant voit les résultats sur son tableau de bord.
 * À la fin : un mot d'encouragement, puis « Voulez-vous écouter un autre souvenir ? ».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BookHeart, Check, Home, Lightbulb, SkipForward, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { SeniorHeader } from "@/components/senior/SeniorHeader";
import { VoiceIndicator, type VoiceMode } from "@/components/senior/VoiceIndicator";
import { ensureSeniorSession } from "@/lib/senior/api";
import { saysNo, saysYes } from "@/lib/senior/replies";
import { answerQuiz, finishQuiz, startQuiz, type QuizOutcome, type QuizStart } from "@/lib/senior/souvenirs";
import { speak, stopSpeaking } from "@/lib/senior/speech";
import { useVoiceInput } from "@/lib/senior/useVoiceInput";

const HOME = "/senior/connexion-reussie?vue=accueil";

/* --- Ce que dit l'assistant (variées, toujours bienveillantes, jamais « faux ») --- */
const BRAVO = ["Bravo, c'est ça !", "Oui, exactement ! Quelle belle mémoire !", "Formidable, c'est la bonne réponse !", "Bravo ! Vous vous en souvenez très bien."];
const ALMOST = "Vous y êtes presque ! ";
const HINT_1 = ["Je vous donne un petit indice : ", "Pas de souci, voici un petit indice : "];
const HINT_2 = ["Encore un petit coup de pouce : ", "Un dernier indice : "];
const GENTLE = ["Ce n'était pas facile, bravo d'avoir essayé !", "C'est un joli détail à garder en mémoire."];
const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Le senior veut arrêter le jeu
const wantsStop = (t: string) => /\b(arrete|stop|j'arrete|ca suffit|fini|termine)\b/.test(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));

type Phase = "loading" | "needTap" | "speaking" | "listening" | "processing" | "end" | "endListening" | "leaving" | "error";
type Result = "pending" | "found" | "hint" | "given" | "skipped";
type Feedback = { kind: "bravo" | "donnee" | "passee"; answer: string } | null;

export default function SeniorQuizPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status, error: micError, level, listen, cancel } = useVoiceInput();
  const [quiz, setQuiz] = useState<QuizStart | null>(null);
  const [current, setCurrent] = useState(0); // question en cours
  const [results, setResults] = useState<Result[]>([]);
  const [hints, setHints] = useState<string[]>([]); // indices donnés pour la question en cours
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [ending, setEnding] = useState("");

  const run = useRef(0); // numéro de la séance : une séance remplacée s'arrête d'elle-même
  const isCurrent = (n: number) => run.current === n;
  // Réponse donnée par un bouton (« Je ne sais pas », « Passer ») à la place de la voix
  const override = useRef<string | null>(null);
  const takeOverride = () => {
    const v = override.current;
    override.current = null;
    return v;
  };
  const setResult = (i: number, r: Result) => setResults((all) => all.map((x, j) => (j === i ? r : x)));

  /* --- Fin du jeu : encouragement, puis « un autre souvenir ? » --- */
  const leave = useCallback(
    async (to: "list" | "home") => {
      const n = ++run.current;
      cancel();
      setPhase("leaving");
      await Promise.race([speak(to === "list" ? "Très bien, choisissons un autre souvenir." : "Très bien. À bientôt !"), wait(2500)]);
      if (isCurrent(n)) router.push(to === "list" ? "/senior/souvenirs/ecouter" : HOME);
    },
    [cancel, router],
  );

  const finish = useCallback(
    async (q: QuizStart, n: number) => {
      const { found, total } = await finishQuiz(q.sessionId).catch(() => ({ found: 0, total: q.questions.length }));
      if (!isCurrent(n)) return;
      const message =
        found === total && total > 0
          ? "Bravo, vous vous êtes souvenu de tout ! Quelle belle mémoire !"
          : found > 0
            ? "Bravo, vous vous êtes très bien souvenu de ce beau moment !"
            : "Merci pour ce joli moment. C'est un très beau souvenir.";
      setEnding(message);
      for (let attempt = 0; attempt < 2; attempt++) {
        setPhase("end");
        await speak(attempt === 0 ? `${message} Voulez-vous écouter un autre souvenir ?` : "Dites « oui » pour un autre souvenir, ou « non » pour revenir à l'accueil.");
        if (!isCurrent(n)) return;
        setPhase("endListening");
        const { text, micError: mic } = await listen({ module: "souvenirs", hint: "oui, non" });
        if (!isCurrent(n)) return;
        if (mic) break;
        setHeard(text);
        if (saysYes(text)) return leave("list");
        if (saysNo(text)) return leave("home");
      }
      if (isCurrent(n)) setPhase("end");
    },
    [listen, leave],
  );

  /* --- Le jeu : chaque question, ses essais, ses indices --- */
  const play = useCallback(
    async (q: QuizStart, from: number, withIntro: boolean) => {
      const n = ++run.current;
      const total = q.questions.length;
      if (withIntro) {
        setPhase("speaking");
        const r = await speak(`C'est parti pour ${total} petites questions sur ce souvenir. Prenez votre temps. Si vous ne savez pas, dites « je ne sais pas » : je vous aiderai.`);
        if (!isCurrent(n)) return;
        if (r === "blocked") return setPhase("needTap");
      }

      for (let i = from; i < total; i++) {
        const question = q.questions[i].question;
        setCurrent(i);
        setHints([]);
        setFeedback(null);
        setHeard(null);
        let attempt = 0;
        let silences = 0;
        let say = total > 1 ? `Question ${i + 1}. ${question}` : question;

        for (;;) {
          // 1. L'assistant parle (question, encouragement ou indice)
          if (override.current === null) {
            setPhase("speaking");
            const r = await speak(say);
            if (!isCurrent(n)) return;
            if (r === "blocked") return setPhase("needTap");
          }

          // 2. Le senior répond (à la voix, ou avec un bouton)
          let text = takeOverride();
          if (text === null) {
            setPhase("listening");
            const heardNow = await listen({ module: "souvenirs" });
            if (!isCurrent(n)) return;
            text = takeOverride() ?? heardNow.text;
            // Micro absent ou refusé : on attend que le senior touche « Un indice » ou « Passer »
            if (heardNow.micError && text === null) {
              setPhase("speaking");
              while (override.current === null && isCurrent(n)) await wait(200);
              if (!isCurrent(n)) return;
              text = takeOverride();
            }
          }
          if (!text) {
            silences++;
            if (silences < 2) {
              say = `Prenez votre temps. ${question}`;
              continue;
            }
            text = "je ne sais pas"; // long silence : on aide plutôt que d'insister
          }
          setHeard(text);
          if (wantsStop(text)) return finish(q, n);

          // 3. Le serveur juge la réponse
          setPhase("processing");
          const res: QuizOutcome | null = await answerQuiz(q.sessionId, i, text, attempt).catch(() => null);
          if (!isCurrent(n)) return;
          if (!res) {
            say = `Pardon, je n'ai pas bien compris. ${question}`;
            continue;
          }

          // 4. L'assistant réagit, toujours avec bienveillance
          setPhase("speaking");
          if (res.outcome === "correct") {
            setResult(i, attempt === 0 ? "found" : "hint");
            setFeedback({ kind: "bravo", answer: res.answer });
            await speak(`${pick(BRAVO)} C'était « ${res.answer} ».`);
            break;
          }
          if (res.outcome === "indice") {
            attempt++;
            setHints((h) => [...h, res.hint]);
            say = `${res.proche ? ALMOST : ""}${pick(attempt === 1 ? HINT_1 : HINT_2)}${res.hint} Qu'en pensez-vous ?`;
            continue;
          }
          if (res.outcome === "donnee") {
            setResult(i, "given");
            setFeedback({ kind: "donnee", answer: res.answer });
            await speak(`C'était « ${res.answer} ». ${pick(GENTLE)}`);
            break;
          }
          setResult(i, "skipped");
          setFeedback({ kind: "passee", answer: res.answer });
          await speak(`D'accord, on passe. C'était « ${res.answer} ».`);
          break;
        }
        if (!isCurrent(n)) return;
        await wait(700);
      }
      if (isCurrent(n)) finish(q, n);
    },
    [listen, finish],
  );

  // À chaque affichage : nouvelle partie. En quittant la page : silence.
  useEffect(() => {
    const startId = run.current;
    ensureSeniorSession()
      .then(() => startQuiz(id))
      .then((q) => {
        if (run.current !== startId) return;
        setQuiz(q);
        setResults(q.questions.map(() => "pending"));
        play(q, 0, true);
      })
      .catch(() => run.current === startId && setPhase("error"));
    return () => {
      run.current++;
      override.current = null;
      stopSpeaking();
      cancel();
      setPhase("loading");
    };
  }, [id, play, cancel]);

  /* --- Boutons : ils répondent à la place de la voix --- */
  const answerWithButton = (text: string) => {
    override.current = text;
    stopSpeaking(); // si l'assistant parlait, il s'arrête et prend la réponse
    cancel(); // si le micro écoutait, il s'arrête et prend la réponse
  };

  const q = quiz?.questions[current];
  const playing = !["end", "endListening", "leaving", "loading", "error"].includes(phase);
  const mode: VoiceMode =
    status === "processing" || phase === "processing"
      ? "processing"
      : phase === "listening" || phase === "endListening"
        ? "listening"
        : phase === "speaking" || phase === "end"
          ? "speaking"
          : "idle";
  const statusText =
    phase === "listening" ? "À vous ! Je vous écoute…" : phase === "endListening" ? "À vous ! Dites « oui » ou « non »." : phase === "processing" ? "Je réfléchis…" : phase === "needTap" ? "Touchez « Commencer »." : phase === "loading" ? "Je prépare le jeu…" : phase === "leaving" ? "C'est parti !" : "L'assistant vous parle…";

  if (phase === "error") {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-canvas">
        <SeniorHeader backHref="/senior/souvenirs/ecouter" backLabel="Mes souvenirs" />
        <p className="mt-16 text-center text-[24px] font-bold text-ink">Ce jeu n&apos;est pas disponible pour ce souvenir.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-gradient-to-b from-brand-50 to-canvas">
      <SeniorHeader backHref="/senior/souvenirs/ecouter" backLabel="Mes souvenirs" />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pt-5 pb-8 text-center sm:px-8">
        {/* En-tête du jeu : souvenir + avancement (pastilles colorées, sans note) */}
        <p className="text-[22px] font-bold text-muted">Petit jeu · {quiz?.title ?? "Souvenir"}</p>
        {quiz && (
          <div className="mt-2 flex items-center gap-2" aria-label={`Question ${current + 1} sur ${quiz.questions.length}`}>
            {results.map((r, i) => (
              <span
                key={i}
                className={cx(
                  "flex h-10 w-10 items-center justify-center rounded-full text-[18px] font-black",
                  r === "found" && "bg-ok-500 text-white",
                  r === "hint" && "bg-warn-500 text-white",
                  (r === "given" || r === "skipped") && "bg-brand-200 text-brand-800",
                  r === "pending" && (i === current && playing ? "bg-brand-600 text-white ring-4 ring-brand-200" : "bg-white text-muted ring-1 ring-line"),
                )}
                aria-hidden="true"
              >
                {r === "found" || r === "hint" ? <Check className="h-5 w-5" /> : i + 1}
              </span>
            ))}
          </div>
        )}

        {/* Carte principale */}
        <section className="mt-5 w-full rounded-[28px] border border-line bg-white px-5 py-6 shadow-card sm:px-8">
          {playing || phase === "loading" ? (
            <>
              {quiz && q && <p className="text-[22px] font-bold text-brand-600">Question {current + 1} sur {quiz.questions.length}</p>}
              <h1 className="mt-1 text-[28px] font-black leading-tight text-brand-900 sm:text-[30px]">{q?.question ?? "…"}</h1>

              <div className="mt-4">
                <VoiceIndicator mode={mode} level={level} statusText={statusText} onTap={() => phase === "needTap" && quiz && play(quiz, current, false)} tapLabel="Commencer" />
              </div>
              {heard && !feedback && <p className="text-[22px] text-muted">Vous avez dit : « {heard} »</p>}

              {/* Indices déjà donnés */}
              {hints.map((h, i) => (
                <p key={i} className="mt-3 flex items-start gap-3 rounded-2xl bg-warn-50 px-4 py-3 text-left text-[22px] font-semibold text-warn-600">
                  <Lightbulb className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" /> Indice {i + 1} : {h}
                </p>
              ))}

              {/* Réaction de l'assistant : bravo, ou réponse racontée avec douceur */}
              {feedback && (
                <p
                  className={cx(
                    "fade-up mt-3 flex items-center justify-center gap-3 rounded-2xl px-4 py-3 text-[24px] font-extrabold",
                    feedback.kind === "bravo" ? "bg-ok-50 text-ok-600" : "bg-brand-50 text-brand-700",
                  )}
                >
                  {feedback.kind === "bravo" ? <Sparkles className="h-7 w-7" aria-hidden="true" /> : <BookHeart className="h-7 w-7" aria-hidden="true" />}
                  {feedback.kind === "bravo" ? "Bravo ! " : ""}C&apos;était « {feedback.answer} »
                </p>
              )}

              {micError && <p className="mt-3 text-[22px] font-semibold text-warn-600">Le micro n&apos;est pas disponible : utilisez les boutons.</p>}

              {/* Boutons d'aide (en plus de la voix) */}
              {phase === "needTap" ? (
                <button type="button" onClick={() => quiz && play(quiz, current, false)} className="mt-5 min-h-16 w-full rounded-2xl bg-brand-600 px-6 text-[24px] font-extrabold text-white shadow-card hover:bg-brand-700">
                  Commencer
                </button>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => answerWithButton("je ne sais pas")}
                    disabled={!!feedback || phase === "processing"}
                    className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border-2 border-warn-500/30 bg-warn-50 px-5 text-[22px] font-extrabold text-warn-600 disabled:opacity-50"
                  >
                    <Lightbulb className="h-7 w-7" aria-hidden="true" /> Un indice, s&apos;il vous plaît
                  </button>
                  <button
                    type="button"
                    onClick={() => answerWithButton("passe")}
                    disabled={!!feedback || phase === "processing"}
                    className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border-2 border-brand-200 bg-white px-5 text-[22px] font-extrabold text-brand-700 disabled:opacity-50"
                  >
                    <SkipForward className="h-7 w-7" aria-hidden="true" /> Passer
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Fin du jeu : encouragement + suite (sans note affichée) */
            <>
              <Sparkles className="mx-auto h-14 w-14 text-warn-500" aria-hidden="true" />
              <h1 className="mt-2 text-[28px] font-black leading-tight text-brand-900">{ending}</h1>
              <p className="mt-2 text-[24px] font-bold text-ink">Voulez-vous écouter un autre souvenir ?</p>
              <div className="mt-3">
                <VoiceIndicator mode={mode} level={level} statusText={statusText} onTap={() => quiz && finish(quiz, ++run.current)} tapLabel="Reposer la question" />
              </div>
              {heard && phase !== "leaving" && <p className="text-[22px] text-muted">Vous avez dit : « {heard} »</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => leave("list")} disabled={phase === "leaving"} className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-brand-600 px-5 text-[22px] font-extrabold text-white shadow-card hover:bg-brand-700 disabled:opacity-50">
                  <BookHeart className="h-7 w-7" aria-hidden="true" /> Un autre souvenir
                </button>
                <button type="button" onClick={() => leave("home")} disabled={phase === "leaving"} className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border-2 border-brand-200 bg-white px-5 text-[22px] font-extrabold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                  <Home className="h-7 w-7" aria-hidden="true" /> Retour à l&apos;accueil
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
