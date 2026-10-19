"use client";

import { useState } from "react";
import { Download, FileBarChart, Lightbulb, Printer, ScrollText } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { fmtDateTime } from "@/lib/format";
import { Button, Card, CardHeader, ErrorBox, Spinner, Tabs, cx } from "@/components/ui";
import { AdminHeader, CAPABILITIES, InsightCard, SEVERITY, fmtNum, fmtSec, useHashTab, usePeriod } from "../shared";
import type { Families, Report } from "../types";
import { downloadExport } from "../download";
import { LogsPanel } from "./LogsPanel";

const TABS = ["journaux", "rapports", "recommandations"] as const;

export default function JournauxPage() {
  const [tab, setTab] = useHashTab(TABS, "journaux");
  return (
    <div className="fade-up">
      <AdminHeader title="Journaux & rapports" subtitle="Approfondir et décider : historique technique, rapports périodiques, exports et recommandations" />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "journaux", label: "Journaux techniques" },
            { value: "rapports", label: "Rapports & exports" },
            { value: "recommandations", label: "Recommandations" },
          ]}
        />
      </div>
      {tab === "journaux" && <LogsPanel />}
      {tab === "rapports" && <ReportPanel />}
      {tab === "recommandations" && <RecommendationsPanel />}
    </div>
  );
}

/* ---------- Rapport périodique ---------- */

type Row = { label: string; get: (f: Families) => number | null; fmt?: (v: number | null) => string; better?: "up" | "down" };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Adoption et engagement",
    rows: [
      { label: "Seniors actifs", get: (f) => f.adoption.activeSeniors, fmt: (v) => fmtNum(v, 0) },
      { label: "Taux d'activation (%)", get: (f) => f.adoption.activationRate },
      { label: "Rétention à 7 jours (%)", get: (f) => f.adoption.retention7 },
    ],
  },
  {
    title: "Utilité fonctionnelle",
    rows: [
      { label: "Réussite des actions vocales (%)", get: (f) => f.utility.voiceSuccessRate },
      { label: "Rappels créés", get: (f) => f.utility.remindersCreated, fmt: (v) => fmtNum(v, 0) },
      { label: "Prises confirmées (%)", get: (f) => f.utility.intakeConfirmRate },
      { label: "Documents expliqués (%)", get: (f) => f.utility.documentsSuccessRate },
    ],
  },
  {
    title: "Qualité de service IA",
    rows: [
      { label: "Latence P95", get: (f) => f.quality.latencyP95, fmt: fmtSec, better: "down" },
      { label: "Réponses en moins de 4 s (%)", get: (f) => f.quality.under4sRate },
      { label: "Taux d'erreur (%)", get: (f) => f.quality.errorRate, better: "down" },
      { label: "Taux de récupération (%)", get: (f) => f.quality.recoveryRate },
    ],
  },
  {
    title: "Valeur pour les aidants",
    rows: [
      { label: "Alertes délivrées (%)", get: (f) => f.caregivers.deliveryRate },
      { label: "Alertes traitées (%)", get: (f) => f.caregivers.handledRate },
      { label: "Synthèses générées", get: (f) => f.caregivers.summariesGenerated, fmt: (v) => fmtNum(v, 0) },
    ],
  },
];

function ReportPanel() {
  const { days } = usePeriod();
  const { data, loading, error } = useApi<Report>(`/admin/report?days=${days}`);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");

  async function exportCsv(type: "kpis" | "events" | "ai-calls") {
    setExporting(type);
    setExportError("");
    try {
      await downloadExport(type, days);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(null);
    }
  }

  if (loading && !data) return <Spinner label="Préparation du rapport…" />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const d = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const critical = data.insights.filter((i) => i.severity === "critique").length;

  return (
    <div id="rapports" className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card className="p-6 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-brand-600">Rapport d&apos;usage — Senior Assistant</p>
            <h2 className="mt-1 text-xl font-extrabold text-brand-900">
              Du {d(data.period.from)} au {d(data.period.to)}
            </h2>
            <p className="text-sm text-muted">Généré le {fmtDateTime(data.generatedAt)} · comparé aux {data.period.days} jours précédents</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" /> Imprimer / PDF
          </Button>
        </div>

        <p className="mt-5 rounded-xl bg-canvas p-4 text-sm leading-relaxed text-ink">
          <b>Synthèse :</b> {data.current.adoption.activeSeniors} seniors actifs, {fmtNum(data.current.utility.voiceSuccessRate)} % d&apos;actions vocales réussies, une latence P95 de{" "}
          {fmtSec(data.current.quality.latencyP95)} et {fmtNum(data.current.caregivers.deliveryRate)} % d&apos;alertes délivrées. {data.insights.length} recommandation(s), dont {critical} critique(s).
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-2 text-sm font-extrabold text-brand-900">{s.title}</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 text-left font-semibold">Indicateur</th>
                    <th className="py-1 text-right font-semibold">Période</th>
                    <th className="py-1 text-right font-semibold">Précédente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.rows.map((r) => {
                    const cur = r.get(data.current);
                    const prev = r.get(data.previous);
                    const f = r.fmt ?? ((v: number | null) => fmtNum(v));
                    const better = cur != null && prev != null && cur !== prev ? (cur > prev) === ((r.better ?? "up") === "up") : null;
                    return (
                      <tr key={r.label}>
                        <td className="py-2 text-ink">{r.label}</td>
                        <td className={cx("py-2 text-right font-bold", better === true ? "text-ok-600" : better === false ? "text-danger-600" : "text-ink")}>{f(cur)}</td>
                        <td className="py-2 text-right text-muted">{f(prev)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <section className="mt-6">
          <h3 className="mb-2 text-sm font-extrabold text-brand-900">Services IA</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 text-left font-semibold">Capacité</th>
                  <th className="py-1 text-left font-semibold">Principal</th>
                  <th className="py-1 text-right font-semibold">Appels</th>
                  <th className="py-1 text-right font-semibold">Disponibilité</th>
                  <th className="py-1 text-right font-semibold">P95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.providers.map((p) => (
                  <tr key={p.capability}>
                    <td className="py-2 text-ink">{CAPABILITIES[p.capability].short}</td>
                    <td className="py-2 text-muted">{p.principal}</td>
                    <td className="py-2 text-right text-muted">{p.calls.toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right font-bold text-ink">{fmtNum(p.availability)} %</td>
                    <td className="py-2 text-right text-ink">{fmtSec(p.latencyP95)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-sm font-extrabold text-brand-900">Recommandations prioritaires</h3>
          <ol className="space-y-2 text-sm">
            {data.insights.slice(0, 5).map((i, n) => (
              <li key={i.id} className="flex gap-2">
                <span className="font-bold text-muted">{n + 1}.</span>
                <span>
                  <b className="text-ink">{i.title}</b> <span className="text-xs font-bold text-muted">({SEVERITY[i.severity].label})</span> — {i.action}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </Card>

      <aside className="space-y-6 print:hidden">
        <Card>
          <CardHeader title="Exporter les statistiques" subtitle={`Fichiers CSV · ${days} derniers jours`} icon={<Download className="h-5 w-5" />} />
          <div className="space-y-2 px-5 pb-5">
            {(
              [
                ["kpis", "Indicateurs du rapport", "Les 4 familles de KPI, période et période précédente"],
                ["events", "Événements d'usage", "Une ligne par action, sans donnée nominative"],
                ["ai-calls", "Journal des appels IA", "Fournisseur, statut, latence, erreurs"],
              ] as const
            ).map(([type, label, text]) => (
              <button
                key={type}
                onClick={() => exportCsv(type)}
                disabled={exporting !== null}
                className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:border-brand-200 hover:bg-brand-50 disabled:opacity-60"
              >
                <FileBarChart className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-ink">{exporting === type ? "Export en cours…" : label}</span>
                  <span className="block text-xs text-muted">{text}</span>
                </span>
              </button>
            ))}
            <ErrorBox>{exportError}</ErrorBox>
          </div>
        </Card>
      </aside>
    </div>
  );
}

/* ---------- Toutes les recommandations ---------- */

function RecommendationsPanel() {
  const { days } = usePeriod();
  const { data, loading, error } = useApi<{ insights: Report["insights"] }>(`/admin/insights?days=${days}`);
  if (loading && !data) return <Spinner label="Analyse des indicateurs…" />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  const list = data?.insights ?? [];
  return (
    <div id="recommandations">
      <Card className="mb-5 flex items-start gap-3 p-4 text-sm text-muted">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <p>
          Les recommandations sont <b className="text-ink">rédigées par un LLM gratuit</b> (Groq, puis Gemini ou OpenRouter en secours) à partir des seuls indicateurs réels de
          la période, calculés par des règles déterministes (seuils réglables dans Configuration). Chaque chiffre cité est vérifié avant affichage ; si aucun LLM n&apos;est
          disponible, les règles prennent le relais. Les données envoyées sont uniquement agrégées, sans aucun nom.
        </p>
      </Card>
      {list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          <ScrollText className="mx-auto mb-2 h-6 w-6" /> Aucune recommandation pour cette période.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
    </div>
  );
}
