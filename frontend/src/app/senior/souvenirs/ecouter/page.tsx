"use client";

/**
 * Interface Senior — Souvenirs : « Écouter un souvenir », choix du souvenir (module F4).
 * URL : /senior/souvenirs/ecouter
 *
 * Déroulé (document F4, étape 3) :
 *  1. l'assistant récupère les souvenirs saisis et validés par l'aidant (non masqués) ;
 *  2. il lit les titres à voix haute : « J'ai 3 souvenirs pour vous : … Lequel voulez-vous écouter ? »
 *     (3 par écran ; « Dites « autres » pour entendre la suite » s'il y en a plus) ;
 *  3. le senior dit le titre, même approximativement (« le mariage », « celui à Tunis », « le deuxième »)
 *     ou touche le souvenir à l'écran ;
 *  4. si deux souvenirs se ressemblent : « Voulez-vous dire … ou … ? » ;
 *     si rien ne correspond : « Je n'ai pas trouvé ce souvenir » et l'assistant relit la liste ;
 *  5. le souvenir choisi s'ouvre : /senior/souvenirs/ecouter/[id] (récit lu à voix haute, étape suivante).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart, ChevronRight, List, MapPin, Speech } from "lucide-react";
import { cx } from "@/components/ui";
import { SeniorHeader } from "@/components/senior/SeniorHeader";
import { VoiceIndicator, type VoiceMode } from "@/components/senior/VoiceIndicator";
import { ensureSeniorSession } from "@/lib/senior/api";
import { chooseMemory, fetchMemories, type ChooseResult, type SeniorMemoryItem } from "@/lib/senior/souvenirs";
import { speak, stopSpeaking } from "@/lib/senior/speech";
import { useVoiceInput } from "@/lib/senior/useVoiceInput";
import { saysYes } from "@/lib/senior/replies";

const PAGE_SIZE = 3; // 3 souvenirs par écran (+ « Autres souvenirs ») : 4 actions au maximum
const MAX_MISSES = 2; // réponses non comprises avant de proposer les boutons

type Phase = "loading" | "needTap" | "speaking" | "listening" | "processing" | "waiting" | "going" | "empty";

const STATUS_TEXT: Record<Phase, string> = {
  loading: "Je cherche vos souvenirs…",
  needTap: "Touchez le micro pour commencer.",
  speaking: "L'assistant vous parle…",
  listening: "À vous ! Dites le nom du souvenir.",
  processing: "Je réfléchis…",
  waiting: "Touchez le souvenir de votre choix, ou le micro pour répondre.",
  going: "C'est parti !",
  empty: "Aucun souvenir pour le moment.",
};

/* --- Phrases de l'assistant --- */
const quote = (m: SeniorMemoryItem) => `« ${m.title} »`;
const joinFr = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")}, et ${items.at(-1)}`);
const pageOf = (list: SeniorMemoryItem[], page: number) => list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

function listText(list: SeniorMemoryItem[], page: number, first: boolean) {
  const view = pageOf(list, page);
  const more = list.length > (page + 1) * PAGE_SIZE;
  const titles = joinFr(view.map(quote));
  if (list.length === 1) return `J'ai un souvenir pour vous : ${titles}. Voulez-vous l'écouter ?`;
  const intro = first
    ? `J'ai ${list.length} souvenirs pour vous${list.length > PAGE_SIZE ? ". Voici les premiers" : ""} : `
    : page === 0
      ? "Voici de nouveau vos premiers souvenirs : "
      : "Voici les suivants : ";
  return `${intro}${titles}. Lequel voulez-vous écouter ?${more ? " Dites « autres » pour entendre la suite." : ""}`;
}

// Mots du senior pour « la suite »
const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const wantsMore = (t: string) => /\b(autres?|suivants?|suite|encore|apres)\b/.test(normalize(t));

export default function SeniorEcouterPage() {
  const router = useRouter();
  const { status, error: micError, level, listen, cancel } = useVoiceInput();
  const [memories, setMemories] = useState<SeniorMemoryItem[]>([]);
  const [page, setPage] = useState(0);
  const [candidates, setCandidates] = useState<SeniorMemoryItem[] | null>(null); // souvenirs « ambigus » proposés
  const [phase, setPhase] = useState<Phase>("loading");
  const [heard, setHeard] = useState<string | null>(null);

  // Numéro de la « séance » en cours : une séance remplacée (page quittée, bouton touché) s'arrête d'elle-même
  const run = useRef(0);
  const isCurrent = (id: number) => run.current === id;

  // Ouvre le souvenir choisi
  const go = useCallback(
    async (memory: SeniorMemoryItem) => {
      const id = ++run.current;
      cancel();
      setPhase("going");
      await Promise.race([speak(`Très bien. Voici ${quote(memory)}.`), new Promise((r) => setTimeout(r, 3000))]);
      if (isCurrent(id)) router.push(`/senior/souvenirs/ecouter/${memory._id}`);
    },
    [cancel, router],
  );

  /**
   * Conversation : lit les titres, écoute la réponse, la comprend, et recommence si besoin.
   * startPage : page de titres par laquelle commencer (0 = les premiers)
   */
  const converse = useCallback(
    async (list: SeniorMemoryItem[], startPage: number, first: boolean) => {
      const id = ++run.current;
      const pages = Math.ceil(list.length / PAGE_SIZE);
      let current = startPage;
      let ambiguous: SeniorMemoryItem[] | null = null;
      let misses = 0;
      let say = listText(list, current, first);

      while (isCurrent(id)) {
        const view: SeniorMemoryItem[] = ambiguous ?? pageOf(list, current);
        setPage(current);
        setCandidates(ambiguous);

        // 1. L'assistant parle
        setPhase("speaking");
        if ((await speak(say)) === "blocked") return setPhase("needTap");
        if (!isCurrent(id)) return;

        // 2. Le senior répond (Whisper aidé par les titres attendus)
        setPhase("listening");
        const { text, micError: mic } = await listen({ module: "souvenirs", hint: `${view.map((m) => m.title).join(", ")}, autres` });
        if (!isCurrent(id)) return;
        if (mic) return setPhase("waiting");
        setHeard(text);

        // 3. Comprendre la réponse
        if (text && !ambiguous && wantsMore(text) && pages > 1) {
          current = (current + 1) % pages;
          say = current === 0 ? `Ce sont tous vos souvenirs. ${listText(list, 0, false)}` : listText(list, current, false);
          continue;
        }
        if (text && list.length === 1 && saysYes(text)) return go(list[0]);
        if (text) {
          setPhase("processing");
          const result: ChooseResult = await chooseMemory(text, view.map((m) => m._id)).catch((): ChooseResult => ({ status: "aucun" }));
          if (!isCurrent(id)) return;
          if (result.status === "trouve") {
            const chosen = list.find((m) => m._id === result.memoryId);
            if (chosen) return go(chosen);
          }
          if (result.status === "ambigu") {
            ambiguous = list.filter((m) => result.candidates.includes(m._id));
            say = `Voulez-vous dire ${joinFr(ambiguous.map(quote)).replace(/, et /, ", ou ")} ?`;
            continue;
          }
        }

        // 4. Pas compris : on relit la liste, puis on propose les boutons
        misses++;
        if (misses > MAX_MISSES) {
          setPhase("waiting");
          await speak("Vous pouvez aussi toucher le souvenir de votre choix.");
          return;
        }
        ambiguous = null;
        say = `${text ? "Je n'ai pas trouvé ce souvenir." : "Je n'ai pas bien entendu."} ${listText(list, current, false)}`;
      }
    },
    [listen, go],
  );

  // À chaque affichage : on récupère les souvenirs, puis l'assistant lit les titres.
  // En quittant la page : la voix et le micro s'arrêtent.
  useEffect(() => {
    const startId = run.current;
    ensureSeniorSession()
      .then(() => fetchMemories())
      .then(async ({ memories: list }) => {
        if (run.current !== startId) return;
        setMemories(list);
        if (!list.length) {
          setPhase("empty");
          await speak("Vous n'avez pas encore de souvenir à écouter. Votre proche peut en ajouter, ou vous pouvez en raconter un.");
          return;
        }
        converse(list, 0, true);
      })
      .catch(() => run.current === startId && setPhase("waiting"));

    return () => {
      run.current++;
      stopSpeaking();
      cancel();
      setPhase("loading");
    };
  }, [converse, cancel]);

  // Bouton micro : relit la liste affichée et rouvre l'écoute
  const restart = () => {
    if (status !== "idle" || phase === "going" || !memories.length) return;
    converse(memories, page, false);
  };
  // Bouton « Autres souvenirs » : page suivante, lue à voix haute
  const nextPage = () => {
    cancel();
    stopSpeaking();
    converse(memories, (page + 1) % Math.ceil(memories.length / PAGE_SIZE), false);
  };
  // Bouton « Tous les souvenirs » (après une question « Voulez-vous dire … ou … ? »)
  const showAll = () => {
    cancel();
    stopSpeaking();
    converse(memories, 0, false);
  };

  const view = candidates ?? pageOf(memories, page);
  const hasMore = !candidates && memories.length > PAGE_SIZE;
  const mode: VoiceMode =
    status === "processing" || phase === "processing" ? "processing" : phase === "listening" ? "listening" : phase === "speaking" ? "speaking" : "idle";

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-canvas">
      <SeniorHeader backHref="/senior/souvenirs" backLabel="Souvenirs" />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pt-6 pb-8 text-center sm:px-8">
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-brand-900 sm:text-[32px]">
          {candidates ? "Lequel voulez-vous dire ?" : "Quel souvenir voulez-vous écouter ?"}
        </h1>

        <div className="mt-4">
          <VoiceIndicator mode={mode} level={level} statusText={STATUS_TEXT[phase]} onTap={restart} tapLabel="Relire la liste et répondre à voix haute" />
        </div>
        {heard && phase !== "going" && <p className="text-[22px] text-muted">Vous avez dit : « {heard} »</p>}
        {micError && <p className="mt-2 rounded-2xl bg-warn-50 px-5 py-2 text-[22px] font-semibold text-warn-600">Le micro n&apos;est pas disponible. Touchez le souvenir de votre choix.</p>}

        {/* Aucun souvenir : on propose d'en raconter un */}
        {phase === "empty" && (
          <button
            type="button"
            onClick={() => router.push("/senior/souvenirs/raconter")}
            className="mt-6 flex min-h-20 items-center gap-4 rounded-3xl border-2 border-violet-500/20 bg-violet-50 px-8 text-[24px] font-extrabold text-ink shadow-card hover:shadow-pop"
          >
            <Speech className="h-9 w-9 text-violet-500" aria-hidden="true" /> Raconter un souvenir
          </button>
        )}

        {/* Les souvenirs proposés : un gros bouton chacun */}
        <ul className="mt-5 grid w-full gap-3">
          {view.map((m, i) => (
            <li key={m._id}>
              <button
                type="button"
                onClick={() => go(m)}
                className="flex min-h-24 w-full items-center gap-4 rounded-3xl border-2 border-brand-200 bg-white px-5 py-3 text-left shadow-card transition-shadow hover:shadow-pop active:scale-[0.99]"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-[24px] font-black text-white" aria-hidden="true">
                  {candidates ? <BookHeart className="h-7 w-7" /> : page * PAGE_SIZE + i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[24px] font-extrabold leading-tight text-ink">{m.title}</span>
                  {(m.date || m.place) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[22px] text-muted">
                      {m.date && <span>{m.date}</span>}
                      {m.place && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-5 w-5" aria-hidden="true" /> {m.place}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Suite de la liste, ou retour à toute la liste après une question « lequel ? » */}
        {(hasMore || candidates) && (
          <button
            type="button"
            onClick={candidates ? showAll : nextPage}
            className={cx("mt-3 flex min-h-16 items-center gap-2 rounded-2xl px-6 text-[22px] font-extrabold text-brand-700 hover:bg-brand-50")}
          >
            {candidates ? <List className="h-7 w-7" aria-hidden="true" /> : null}
            {candidates ? "Tous mes souvenirs" : "Autres souvenirs"}
            {!candidates && <ChevronRight className="h-7 w-7" aria-hidden="true" />}
          </button>
        )}
      </main>
    </div>
  );
}
