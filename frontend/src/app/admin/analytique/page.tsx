"use client";

import { Clock, Filter, GitCompare, Mic, PieChart, Repeat, Target } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Card, CardHeader, ErrorBox, Spinner, cx } from "@/components/ui";
import { BLUE_RAMP, DonutChart, Funnel, Heatmap, Legend, LineChart, MODULE_COLORS, MODULE_ORDER, OutcomeBars, SERIES } from "@/components/admin/charts";
import { AdminHeader, Delta, InfoTip, dayLabel, fmtNum } from "../shared";
import { usePeriod } from "../shared";
import type { Analytics } from "../types";

const FAILURE_LABELS: Record<string, string> = {
  horaire_non_identifie: "Horaire non identifié",
  intention_non_comprise: "Intention non comprise",
  audio_inaudible: "Audio inaudible",
  contact_inconnu: "Contact inconnu",
  document_illisible: "Document illisible",
  delai_depasse: "Délai dépassé",
};

const PREVIOUS = "#9fb2d0"; // période précédente : gris neutre, pointillés

export default function AnalytiquePage() {
  const { days } = usePeriod();
  const { data, loading, error } = useApi<Analytics>(`/admin/analytics?days=${days}`);

  if (loading && !data) return <Spinner label="Analyse des usages…" />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const c = data.comparison;
  const labels = data.series.map((d) => dayLabel(d.date));
  const voicePts = c.voiceShare.current != null && c.voiceShare.previous != null ? Math.round((c.voiceShare.current - c.voiceShare.previous) * 10) / 10 : null;

  return (
    <div className={cx("fade-up space-y-6", loading && "opacity-60")}>
      <AdminHeader title="Analytique & tendances" subtitle="Comprendre comment l'application est utilisée et quelles fonctionnalités apportent de la valeur" />

      {/* Comparaison avec la période précédente */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Compare label="Actions des seniors" value={c.interactions.current.toLocaleString("fr-FR")} prev={c.interactions.previous.toLocaleString("fr-FR")} delta={<Delta value={c.interactions.delta} />} />
        <Compare
          label="Seniors actifs"
          value={String(c.activeSeniors.current)}
          prev={String(c.activeSeniors.previous)}
          delta={<Delta value={c.activeSeniors.previous ? Math.round(((c.activeSeniors.current - c.activeSeniors.previous) / c.activeSeniors.previous) * 1000) / 10 : null} />}
        />
        <Compare label="Part des actions à la voix" value={`${fmtNum(c.voiceShare.current)} %`} prev={`${fmtNum(c.voiceShare.previous)} %`} delta={<Delta value={voicePts} suffix="pts" />} />
        <Compare
          label="Actions par jour (moyenne)"
          value={c.avgPerDay.current.toLocaleString("fr-FR")}
          prev={c.avgPerDay.previous.toLocaleString("fr-FR")}
          delta={<Delta value={c.avgPerDay.previous ? Math.round(((c.avgPerDay.current - c.avgPerDay.previous) / c.avgPerDay.previous) * 1000) / 10 : null} />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Évolution de l'activité"
            subtitle="Période en cours comparée à la période précédente, jour par jour"
            icon={<GitCompare className="h-5 w-5" />}
            action={
              <Legend
                items={[
                  { label: "Période en cours", color: SERIES[0] },
                  { label: "Période précédente", color: PREVIOUS, dashed: true },
                ]}
              />
            }
          />
          <div className="px-3 pb-4">
            <LineChart
              labels={labels}
              series={[
                { key: "cur", label: "Période en cours", color: SERIES[0], values: data.series.map((d) => d.interactions) },
                { key: "prev", label: "Période précédente", color: PREVIOUS, values: data.prevSeries.map((d) => d.interactions), dashed: true },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Adoption de la voix"
            subtitle="Part des actions des seniors réalisées à la voix plutôt qu'à l'écran"
            icon={<Mic className="h-5 w-5" />}
          />
          <div className="px-3 pb-4">
            <LineChart
              labels={labels}
              format={(v) => `${Math.round(v)} %`}
              series={[{ key: "v", label: "Part de la voix", color: SERIES[0], values: data.series.map((d) => d.voiceShare) }]}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Répartition par module" subtitle="Actions des seniors sur la période" icon={<PieChart className="h-5 w-5" />} />
          <div className="px-5 pb-5">
            <DonutChart
              centerValue={c.interactions.current.toLocaleString("fr-FR")}
              centerLabel="actions"
              items={MODULE_ORDER.map((k) => data.modules.find((m) => m.module === k))
                .filter((m) => m !== undefined)
                .map((m) => ({ key: m.module, label: m.label, value: m.count, color: MODULE_COLORS[m.module] }))}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Réussite par fonctionnalité" subtitle="Quelles fonctionnalités réussissent ou échouent le plus souvent ?" icon={<Target className="h-5 w-5" />} />
          <div className="px-5 pb-5">
            <OutcomeBars rows={data.modules.map((m) => ({ label: m.label, success: m.success, failure: m.failure, abandon: m.abandon }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card id="entonnoir" className="scroll-mt-24">
          <CardHeader
            title="Entonnoir des actions vocales"
            subtitle="À quelle étape les seniors abandonnent-ils une demande ?"
            icon={<Filter className="h-5 w-5" />}
            action={
              <InfoTip>
                Chaque demande vocale est suivie jusqu&apos;à l&apos;étape atteinte : demande entendue → intention comprise → action confirmée par le senior → action
                réalisée. Source : événements d&apos;usage (canal voix).
              </InfoTip>
            }
          />
          <div className="px-5 pb-5">
            <Funnel steps={data.funnel} />
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Intentions vocales" subtitle="Demandées, réalisées et première cause d'échec" icon={<Mic className="h-5 w-5" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">Intention</th>
                  <th className="px-3 py-2.5 text-right">Demandées</th>
                  <th className="px-3 py-2.5 text-right">Réalisées</th>
                  <th className="px-3 py-2.5 text-right">Réussite</th>
                  <th className="px-5 py-2.5">Première cause d&apos;échec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.intents.map((i) => (
                  <tr key={i.intent}>
                    <td className="px-5 py-3 font-semibold text-ink">{i.label}</td>
                    <td className="px-3 py-3 text-right text-muted">{i.requested.toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-3 text-right text-muted">{i.realized.toLocaleString("fr-FR")}</td>
                    <td className={cx("px-3 py-3 text-right font-bold", (i.successRate ?? 100) < 85 ? "text-danger-600" : "text-ink")}>{fmtNum(i.successRate)} %</td>
                    <td className="px-5 py-3 text-muted">{i.topFailure ? `${FAILURE_LABELS[i.topFailure.reason] ?? i.topFailure.reason} (${i.topFailure.count})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card id="heures" className="scroll-mt-24">
          <CardHeader title="Quand l'application est-elle sollicitée ?" subtitle="Actions des seniors par jour de la semaine et par heure" icon={<Clock className="h-5 w-5" />} />
          <div className="px-5 pb-5">
            <Heatmap data={data.heatmap} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Récurrence d'utilisation"
            subtitle="Seniors actifs selon la part de jours d'activité"
            icon={<Repeat className="h-5 w-5" />}
          />
          <ul className="space-y-4 px-5 pb-5">
            {data.recurrence.map((r, i) => {
              const total = data.recurrence.reduce((s, x) => s + x.count, 0) || 1;
              return (
                <li key={r.label}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-ink">
                      {r.label} <span className="text-xs font-normal text-muted">({r.detail})</span>
                    </span>
                    <b className="text-ink">{r.count}</b>
                  </div>
                  <div className="h-3 rounded-full bg-canvas">
                    <div className="h-3 rounded-full" style={{ width: `${(r.count / total) * 100}%`, background: BLUE_RAMP[3 + i] }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Compare({ label, value, prev, delta }: { label: string; value: string; prev: string; delta: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-black text-ink">{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        {delta} <span>période préc. : {prev}</span>
      </p>
    </Card>
  );
}
