"use client";

/**
 * Aperçu de ce que le senior verra et entendra : les photos, le récit et les questions du quiz,
 * avec leurs réponses et leurs 2 indices.
 *
 * « Proposer un autre récit » fonctionne en deux temps :
 *   1. l'IA écrit une PROPOSITION, affichée à la place du récit actuel, mais rien n'est enregistré ;
 *   2. l'aidant choisit :
 *        - « Garder cette version »  → la proposition est enregistrée (mise à jour en base) ;
 *        - « Revenir à la version actuelle » → la proposition est oubliée, la base n'est pas modifiée.
 * Fermer la fenêtre sans choisir revient aussi à garder la version actuelle.
 */
import { useEffect, useState } from "react";
import { Check, Lightbulb, RefreshCw, Undo2 } from "lucide-react";
import { Button, ErrorBox, Modal, cx } from "@/components/ui";
import { memoryApi, photoPath } from "@/lib/souvenirs/api";
import type { Memory, MemoryProposal, MemoryQuestion } from "@/lib/souvenirs/types";
import { MemoryPhoto } from "./MemoryPhoto";

export function MemoryDetailModal({
  base,
  memory,
  onClose,
  onUpdated,
}: {
  base: string;
  memory: Memory;
  onClose: () => void;
  onUpdated: (memory: Memory) => void;
}) {
  const [current, setCurrent] = useState(memory); // version enregistrée en base
  const [proposal, setProposal] = useState<MemoryProposal | null>(null); // version proposée, en attente
  const [loading, setLoading] = useState<"propose" | "accept" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // À l'ouverture, on relit le souvenir depuis le serveur : on affiche ainsi toujours
  // la dernière version enregistrée (par exemple juste après une modification au stylo)
  useEffect(() => {
    memoryApi
      .get(base, memory._id)
      .then(({ memory: fresh }) => setCurrent(fresh))
      .catch(() => {}); // en cas d'échec, on garde la version de la liste
  }, [base, memory._id]);

  // Ce qui est affiché : la proposition si elle existe, sinon la version enregistrée
  const shown = proposal ?? current.generated;

  // Étape 1 : demander une proposition (aucune écriture en base)
  async function propose() {
    setLoading("propose");
    setError("");
    setNotice("");
    try {
      const { proposal: p } = await memoryApi.propose(base, current._id);
      if (p.recit === current.generated?.recit) {
        // Sans IA disponible, le générateur de secours réécrit exactement le même texte
        setNotice("Aucune nouvelle formulation : l'IA n'est pas disponible pour le moment. Vérifiez la clé GROQ_API_KEY du serveur, puis réessayez.");
      } else {
        setProposal(p);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  // Étape 2a : l'aidant garde la proposition → mise à jour en base
  async function accept() {
    if (!proposal) return;
    setLoading("accept");
    setError("");
    try {
      const { memory: saved } = await memoryApi.acceptProposal(base, current._id, proposal);
      setCurrent(saved);
      setProposal(null);
      onUpdated(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  // Étape 2b : l'aidant refuse → on revient à la version enregistrée, rien n'est envoyé au serveur
  function discard() {
    setProposal(null);
    setError("");
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={current.title}
      footer={
        proposal ? (
          <>
            <Button variant="ghost" onClick={discard} disabled={loading === "accept"}>
              <Undo2 className="h-4 w-4" /> Revenir à la version actuelle
            </Button>
            <Button onClick={accept} loading={loading === "accept"}>
              <Check className="h-4 w-4" /> Garder cette version
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={propose} loading={loading === "propose"}>
              <RefreshCw className="h-4 w-4" /> Proposer un autre récit
            </Button>
            <Button onClick={onClose}>Fermer</Button>
          </>
        )
      }
    >
      {!shown ? (
        <p className="text-sm text-muted">Le récit n&apos;a pas encore été généré.</p>
      ) : (
        <div className="space-y-5">
          {/* Bandeau : la proposition n'est pas encore enregistrée */}
          {proposal && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
              <p className="font-bold">Nouvelle proposition, pas encore enregistrée</p>
              <p className="mt-0.5">
                Lisez-la, puis choisissez « Garder cette version » pour la valider, ou « Revenir à la version actuelle » pour l&apos;annuler.
              </p>
            </div>
          )}

          {/* Message quand aucune IA n'a pu reformuler */}
          {notice && <p className="rounded-xl bg-warn-50 px-4 py-3 text-sm font-semibold text-warn-600">{notice}</p>}

          {/* Les photos, montrées en grand au senior pendant l'écoute */}
          {current.photos.length > 0 && (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Photos montrées au senior</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {current.photos.map((p, i) => (
                  <MemoryPhoto key={p._id} path={photoPath(base, current._id, p._id)} alt={`Photo ${i + 1} du souvenir`} className="aspect-square w-full rounded-xl" />
                ))}
              </div>
            </section>
          )}

          {/* Le récit, tel qu'il sera lu à voix haute au senior */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{proposal ? "Récit proposé" : "Récit lu au senior"}</h3>
            <p className={cx("mt-2 rounded-xl p-4 text-[16px] leading-relaxed text-ink", proposal ? "border-2 border-dashed border-brand-300 bg-white" : "bg-canvas")}>
              {shown.recit}
            </p>
          </section>

          {/* Les questions du quiz, avec la réponse attendue et les 2 indices */}
          <QuizList questions={shown.questions} proposed={Boolean(proposal)} />
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </Modal>
  );
}

function QuizList({ questions, proposed }: { questions: MemoryQuestion[]; proposed: boolean }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
        {proposed ? "Quiz proposé" : "Quiz"} ({questions.length} question{questions.length > 1 ? "s" : ""})
      </h3>
      <ol className="mt-2 space-y-3">
        {questions.map((q, i) => (
          <li key={i} className={cx("rounded-xl p-4", proposed ? "border-2 border-dashed border-brand-300" : "border border-line")}>
            <p className="font-bold text-ink">
              {i + 1}. {q.question}
            </p>
            <p className="mt-1 text-sm text-ok-600">
              Réponse attendue : <b>{q.answer}</b>
            </p>
            <ul className="mt-2 space-y-1">
              {q.hints.map((h, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-muted">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warn-600" />
                  Indice {j + 1} : {h}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Si la réponse ne correspond pas, l&apos;assistant ne dit jamais « faux » : il propose l&apos;indice 1, puis l&apos;indice 2, puis raconte
        la réponse avec douceur.
      </p>
    </section>
  );
}
