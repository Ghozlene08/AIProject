"use client";

/**
 * Carte « Souvenirs » du tableau de bord de l'aidant (7 derniers jours) :
 * souvenirs écoutés, quiz joués, réponses trouvées sans ou avec indice, souvenirs à valider.
 * Ces chiffres mesurent la participation du senior, pas sa mémoire.
 */
import Link from "next/link";
import { BookHeart, ChevronDown, ChevronRight } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { Badge, Card, CardHeader, cx } from "@/components/ui";
import { fmtShort } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { memoryPaths } from "@/lib/souvenirs/api";
import type { MemoryStats, QuizResult } from "@/lib/souvenirs/types";

// Libellé et couleur de chaque résultat (aucun « faux » : on parle d'aide reçue)
const RESULT: Record<QuizResult, { label: string; cls: string }> = {
  sans_indice: { label: "Trouvée seule", cls: "bg-ok-50 text-ok-600" },
  un_indice: { label: "Trouvée avec 1 indice", cls: "bg-warn-50 text-warn-600" },
  deux_indices: { label: "Trouvée avec 2 indices", cls: "bg-warn-50 text-warn-600" },
  donnee: { label: "Réponse racontée", cls: "bg-brand-50 text-brand-700" },
  passee: { label: "Passée", cls: "bg-slate-100 text-slate-600" },
};

export function MemoryStatsCard({ base }: { base: string }) {
  const { data } = useApi<MemoryStats>(memoryPaths.stats(base, 7));
  if (!data) return null; // la carte apparaît dès que les chiffres sont chargés

  const { quizzes, memories } = data;
  const items = [
    { label: "Souvenirs écoutés", value: String(data.listened) },
    { label: "Quiz joués", value: String(quizzes.played) },
    { label: "Trouvées sans indice", value: `${quizzes.withoutHint} / ${quizzes.answered}` },
    { label: "Trouvées avec un indice", value: `${quizzes.withHint} / ${quizzes.answered}` },
  ];

  return (
    <Card>
      <CardHeader
        title="Souvenirs"
        subtitle="7 derniers jours"
        icon={<BookHeart className="h-5 w-5" />}
        action={
          <Link href="/aidant/souvenirs" className="flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
            {memories.pending > 0 && <Badge tone="violet">{memories.pending} à valider</Badge>}
            Voir <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="grid gap-5 px-5 pb-5 sm:grid-cols-[1fr_200px]">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="rounded-xl bg-canvas p-3">
              <dt className="text-xs font-semibold text-muted">{it.label}</dt>
              <dd className="mt-1 text-2xl font-black text-ink">{it.value}</dd>
            </div>
          ))}
        </dl>
        {/* Petite courbe : nombre de souvenirs écoutés par jour */}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Écoutes par jour</p>
          <Sparkline values={data.daily.map((d) => d.listened)} color="#8b5cf6" />
        </div>
      </div>
      {/* Détail des derniers quiz : chaque question, ce que le senior a répondu, et l'aide reçue */}
      {data.recentQuizzes?.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <p className="mb-2 text-sm font-bold text-ink">Derniers quiz</p>
          <ul className="space-y-2">
            {data.recentQuizzes.map((s) => (
              <li key={s._id}>
                <details className="group rounded-xl border border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{s.memoryTitle}</span>
                      <span className="text-xs text-muted">{fmtShort(s.createdAt)}</span>
                    </span>
                    {/* Une pastille par question */}
                    <span className="flex gap-1" aria-hidden="true">
                      {s.answers.map((a, i) => (
                        <span key={i} className={cx("h-3 w-3 rounded-full", a.result === "sans_indice" ? "bg-ok-500" : a.result === "un_indice" || a.result === "deux_indices" ? "bg-warn-500" : "bg-slate-300")} />
                      ))}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <ol className="space-y-2 border-t border-line px-3 py-3">
                    {s.answers.map((a, i) => (
                      <li key={i} className="text-sm">
                        <p className="font-semibold text-ink">
                          {i + 1}. {a.question ?? "Question"}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-muted">
                          <span>Réponse : « {a.given || "—"} »</span>
                          <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", RESULT[a.result].cls)}>{RESULT[a.result].label}</span>
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Ces chiffres reflètent la participation de votre proche, ce n&apos;est pas un test médical.
      </p>
    </Card>
  );
}
