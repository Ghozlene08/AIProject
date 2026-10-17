"use client";

import { useState } from "react";
import { Bot, CalendarDays, CheckCircle2, FileText, Sparkles, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtShort } from "@/lib/format";
import type { WeeklySummary } from "@/lib/types";
import { Donut } from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Spinner, cx } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";

export default function SynthesePage() {
  const { senior, base, refreshUnread } = useCurrentSenior();
  const { data, loading, reload } = useApi<{ summaries: WeeklySummary[] }>(`${base}/summaries`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const summaries = data?.summaries ?? [];
  const current = summaries.find((s) => s._id === selectedId) ?? summaries[0];

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const { summary } = await api.post<{ summary: WeeklySummary }>(`${base}/summaries`);
      setSelectedId(summary._id);
      reload();
      refreshUnread();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fade-up">
      <PageHeader
        title="Synthèse hebdomadaire"
        subtitle={`Un résumé rédigé par l'IA de la semaine de ${senior.firstName}`}
        action={
          <Button onClick={generate} loading={generating}>
            <Sparkles className="h-4 w-4" /> Générer la synthèse
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {loading && !data ? (
        <Spinner />
      ) : !current ? (
        <Card>
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Aucune synthèse" text="Générez la première synthèse de la semaine écoulée." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                title={`Semaine du ${fmtShort(current.periodStart)} au ${fmtShort(current.periodEnd)}`}
                icon={<CalendarDays className="h-5 w-5" />}
                action={
                  <Badge tone="violet">
                    <Bot className="h-3.5 w-3.5" /> {current.provider ?? "IA"}
                  </Badge>
                }
              />
              <div className="px-5 pb-6">
                <div className="whitespace-pre-line rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 text-[17px] leading-relaxed text-ink">{current.content}</div>
                <p className="mt-3 text-xs text-muted">
                  Texte généré automatiquement à partir de données anonymisées, puis vérifié avant affichage. Il ne remplace pas un avis médical.
                </p>
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="flex items-center gap-4 p-5">
                <Donut value={current.stats.adherence} size={76} stroke={8} />
                <p className="text-sm font-bold text-muted">Observance</p>
              </Card>
              <Card className="p-5">
                <p className="flex items-center gap-2 text-sm font-bold text-muted">
                  <CheckCircle2 className="h-4 w-4 text-ok-500" /> Prises confirmées
                </p>
                <p className="mt-1 text-3xl font-black text-ink">
                  {current.stats.intakesConfirmed}
                  <span className="text-lg text-muted"> / {current.stats.intakesTotal}</span>
                </p>
              </Card>
              <Card className="p-5">
                <p className="flex items-center gap-2 text-sm font-bold text-muted">
                  <XCircle className="h-4 w-4 text-danger-500" /> Prises manquées
                </p>
                <p className="mt-1 text-3xl font-black text-ink">{current.stats.intakesMissed}</p>
              </Card>
            </div>
          </div>

          <Card className="self-start">
            <CardHeader title="Historique" />
            <ul className="space-y-1 px-3 pb-3">
              {summaries.map((s) => (
                <li key={s._id}>
                  <button
                    onClick={() => setSelectedId(s._id)}
                    className={cx(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm",
                      s._id === current._id ? "bg-brand-50 font-bold text-brand-700" : "text-ink hover:bg-canvas",
                    )}
                  >
                    <span>
                      {fmtShort(s.periodStart)} → {fmtShort(s.periodEnd)}
                    </span>
                    <span className="text-xs text-muted">{s.stats.adherence} %</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
