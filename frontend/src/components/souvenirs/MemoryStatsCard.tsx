"use client";

/**
 * Carte « Souvenirs » du tableau de bord de l'aidant (7 derniers jours) :
 * souvenirs écoutés, quiz joués, réponses trouvées sans ou avec indice, souvenirs à valider.
 * Ces chiffres mesurent la participation du senior, pas sa mémoire.
 */
import Link from "next/link";
import { BookHeart, ChevronRight } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { Badge, Card, CardHeader } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { memoryPaths } from "@/lib/souvenirs/api";
import type { MemoryStats } from "@/lib/souvenirs/types";

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
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Ces chiffres reflètent la participation de votre proche, ce n&apos;est pas un test médical.
      </p>
    </Card>
  );
}
