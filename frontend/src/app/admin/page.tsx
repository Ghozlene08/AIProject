"use client";

import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Cloud,
  Download,
  FileSearch,
  Gauge,
  HeartHandshake,
  Lightbulb,
  PieChart,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { fmtRelative } from "@/lib/format";
import { Badge, Card, CardHeader, ErrorBox, Spinner, cx } from "@/components/ui";
import { DonutChart, Legend, LineChart, MODULE_COLORS, MODULE_ORDER, SERIES, Spark } from "@/components/admin/charts";
import { ACTION_LABELS, AdminHeader, CAPABILITIES, InfoTip, InsightCard, KpiCard, dayLabel, fmtNum, fmtSec, usePeriod } from "./shared";
import type { Overview } from "./types";
import { downloadExport } from "./download";

const KPI_STYLE = [
  { icon: Users, tone: "bg-brand-600", color: SERIES[0] },
  { icon: Activity, tone: "bg-[#1baf7a]", color: SERIES[2] },
  { icon: Timer, tone: "bg-[#6250d6]", color: SERIES[5] },
  { icon: BellRing, tone: "bg-[#eb6834]", color: SERIES[1] },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const { days } = usePeriod();
  const { data, loading, error } = useApi<Overview>(`/admin/overview?days=${days}`);

  if (loading && !data) return <Spinner label="Calcul des indicateurs…" />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const f = data.families;
  const status = data.systemStatus;

  return (
    <div className={cx("fade-up", loading && "opacity-60 transition-opacity")}>
      <AdminHeader title={`Bonjour ${user?.name.split(" ")[0]},`} subtitle="Voici un aperçu global de la plateforme Senior Assistant.">
        <span
          title={status.detail}
          className={cx(
            "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold",
            status.level === "ok" ? "bg-ok-50 text-ok-600" : "bg-warn-50 text-warn-600",
          )}
        >
          {status.level === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertOctagon className="h-4 w-4" />} {status.label}
        </span>
      </AdminHeader>

      <div className="grid gap-6 3xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* 4 KPI vedettes : une par famille */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.kpis.map((k, i) => (
              <KpiCard key={k.key} kpi={k} {...KPI_STYLE[i]} days={data.period.days} />
            ))}
          </div>

          {/* Détail des quatre familles d'indicateurs */}
          <Card className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 2xl:grid-cols-4">
            <Family
              title="Adoption et engagement"
              icon={TrendingUp}
              rows={[
                { label: "Taux d'activation", value: `${fmtNum(f.adoption.activationRate)} %`, def: "Profils ayant réalisé au moins une première action ÷ profils créés." },
                { label: "Rétention à 7 jours", value: `${fmtNum(f.adoption.retention7)} %`, def: `Seniors activés depuis plus de 7 jours et actifs au cours des 7 derniers jours (cohorte : ${f.adoption.retentionCohort}).` },
              ]}
            />
            <Family
              title="Utilité fonctionnelle"
              icon={Sparkles}
              rows={[
                { label: "Rappels créés", value: fmtNum(f.utility.remindersCreated, 0), sub: `${f.utility.remindersFailed} échoués`, def: "Rappels réellement enregistrés à la demande du senior (les tentatives échouées sont comptées à part)." },
                { label: "Prises confirmées", value: `${fmtNum(f.utility.intakeConfirmRate)} %`, sub: `${f.utility.intakesDue} prises dues`, def: "Prises confirmées ÷ prises dont l'horaire est passé (confirmées + manquées)." },
                { label: "Documents expliqués", value: `${fmtNum(f.utility.documentsSuccessRate)} %`, sub: `${f.utility.documents} documents`, def: "Documents lus par OCR puis expliqués avec succès ÷ documents soumis." },
              ]}
            />
            <Family
              title="Qualité de service IA"
              icon={Gauge}
              rows={[
                { label: "Latence P50 / P95", value: `${fmtSec(f.quality.latencyP50)} / ${fmtSec(f.quality.latencyP95)}`, def: "Temps de réponse vocale médian et au 95e centile. Objectif : P95 < 4 s." },
                { label: "Taux d'erreur", value: `${fmtNum(f.quality.errorRate)} %`, sub: `${f.quality.aiCalls.toLocaleString("fr-FR")} appels IA`, def: "Appels aux services IA en erreur ÷ appels totaux (toutes capacités)." },
                { label: "Bascule / récupération", value: `${fmtNum(f.quality.fallbackRate)} % / ${fmtNum(f.quality.recoveryRate)} %`, def: "Bascule : appels LLM réussis servis par un secours. Récupération : erreurs du fournisseur principal rattrapées par un secours." },
              ]}
            />
            <Family
              title="Valeur pour les aidants"
              icon={HeartHandshake}
              rows={[
                { label: "Alertes traitées", value: `${fmtNum(f.caregivers.handledRate)} %`, sub: `${f.caregivers.alertsHandled} / ${f.caregivers.alertsCreated}`, def: "Alertes consultées par un aidant ÷ alertes créées. Distinct de la délivrance : une alerte peut être délivrée sans être lue." },
                { label: "Synthèses générées", value: fmtNum(f.caregivers.summariesGenerated, 0), def: "Synthèses hebdomadaires disponibles pour les aidants sur la période." },
              ]}
            />
          </Card>

          {/* Deux visualisations principales */}
          <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader
                title="Évolution de l'utilisation"
                subtitle={`Actions des seniors et seniors actifs par jour, ${data.period.days} derniers jours`}
                icon={<TrendingUp className="h-5 w-5" />}
                action={
                  <Legend
                    items={[
                      { label: "Actions", color: SERIES[0] },
                      { label: "Seniors actifs", color: SERIES[2] },
                    ]}
                  />
                }
              />
              <div className="px-3 pb-4">
                <LineChart
                  labels={data.series.map((d) => dayLabel(d.date))}
                  series={[
                    { key: "a", label: "Actions", color: SERIES[0], values: data.series.map((d) => d.interactions) },
                    { key: "s", label: "Seniors actifs", color: SERIES[2], values: data.series.map((d) => d.activeSeniors) },
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Répartition par module" subtitle="Actions des seniors et des aidants sur la période" icon={<PieChart className="h-5 w-5" />} />
              <div className="px-5 pb-5">
                <DonutChart
                  centerValue={data.modules.reduce((s, m) => s + m.count, 0).toLocaleString("fr-FR")}
                  centerLabel="actions"
                  items={MODULE_ORDER.map((k) => data.modules.find((m) => m.module === k))
                    .filter((m) => m !== undefined)
                    .map((m) => ({ key: m.module, label: m.label, value: m.count, color: MODULE_COLORS[m.module] }))}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            {/* Qualité de service IA par capacité */}
            <Card className="overflow-hidden">
              <CardHeader
                title="Performances des services IA"
                subtitle="Disponibilité et temps de réponse par capacité"
                icon={<Cloud className="h-5 w-5" />}
                action={
                  <Link href="/admin/services-ia" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
                    Détails <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-5 py-2.5">Capacité</th>
                      <th className="px-3 py-2.5">Principal / secours</th>
                      <th className="px-3 py-2.5">Disponibilité</th>
                      <th className="px-3 py-2.5">P95</th>
                      <th className="hidden px-5 py-2.5 2xl:table-cell">Tendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.providers.map((p) => {
                      const C = CAPABILITIES[p.capability];
                      const ok = (p.availability ?? 100) >= 99;
                      return (
                        <tr key={p.capability}>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-2 whitespace-nowrap font-semibold text-ink">
                              <C.icon className="h-4 w-4 text-brand-600" /> {C.short}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="block text-ink">{p.principal}</span>
                            <span className="block text-xs text-muted">{p.fallbacks.length ? `secours : ${p.fallbacks.join(", ")}` : "sans secours"}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap font-bold", ok ? "text-ok-600" : "text-warn-600")}>
                              <span className={cx("h-2 w-2 rounded-full", ok ? "bg-ok-500" : "bg-warn-500")} />
                              {fmtNum(p.availability)} %
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">{fmtSec(p.latencyP95)}</td>
                          <td className="hidden px-5 py-3 2xl:table-cell">
                            <Spark values={p.series.map((s) => s.latencyP95 ?? 0)} color={SERIES[0]} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Répartition des utilisateurs */}
            <Card>
              <CardHeader title="Répartition des utilisateurs" subtitle="Par rôle et par ville (seniors)" icon={<Users className="h-5 w-5" />} />
              <div className="space-y-4 px-5 pb-5">
                <DonutChart
                  size={150}
                  centerValue={data.users.total.toLocaleString("fr-FR")}
                  centerLabel="comptes"
                  items={[
                    { key: "seniors", label: "Seniors", value: data.users.seniors, color: SERIES[0] },
                    { key: "aidants", label: "Aidants", value: data.users.aidants, color: SERIES[2] },
                    { key: "admins", label: "Administrateurs", value: data.users.admins, color: SERIES[5] },
                  ]}
                />
                <div className="grid grid-cols-2 gap-2">
                  {data.users.sites.slice(0, 4).map((s) => (
                    <div key={s.city} className="rounded-xl border border-line px-3 py-2">
                      <p className="text-sm font-bold text-ink">{s.city}</p>
                      <p className="text-xs text-muted">
                        {s.count} seniors · {fmtNum(s.share)} %
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Insights & recommandations */}
          <Card id="insights" className="scroll-mt-24">
            <CardHeader
              title="Insights & recommandations"
              subtitle="Rédigées par un LLM gratuit à partir des indicateurs réels, chiffres vérifiés"
              icon={<Lightbulb className="h-5 w-5" />}
              action={
                <Link href="/admin/journaux#recommandations" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
                  Toutes les recommandations <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="grid gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
              {data.insights.map((i) => (
                <InsightCard key={i.id} insight={i} compact />
              ))}
              {data.insights.length === 0 && <p className="text-sm text-muted">Aucune recommandation pour cette période.</p>}
            </div>
          </Card>
        </div>

        {/* Colonne de droite */}
        <aside className="grid content-start gap-6 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-1">
          <Card>
            <CardHeader title="Alertes nécessitant une action" icon={<AlertOctagon className="h-5 w-5" />} subtitle="Non consultées par un aidant" />
            <ul className="space-y-2 px-5 pb-5">
              {data.pendingAlerts.map((a) => (
                <li key={a.severity} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Badge tone={a.severity === "haute" ? "danger" : a.severity === "moyenne" ? "warn" : "brand"}>
                      {a.severity === "haute" ? "Haute" : a.severity === "moyenne" ? "Moyenne" : "Info"}
                    </Badge>
                    {a.oldest && <span className="text-xs text-muted">depuis le {dayLabel(a.oldest)}</span>}
                  </span>
                  <span className="text-xl font-black text-ink">{a.count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Activités récentes" icon={<Activity className="h-5 w-5" />} />
            <ul className="space-y-1 px-3 pb-4">
              {data.recent.map((r) => (
                <li key={r._id} className="flex items-start gap-3 rounded-xl px-2 py-2">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: MODULE_COLORS[r.module] ?? SERIES[0] }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{ACTION_LABELS[r.action] ?? r.action}</p>
                    <p className="truncate text-xs text-muted">
                      {r.who} · {fmtRelative(r.at)} {r.channel === "voix" && "· à la voix"}
                    </p>
                  </div>
                  {r.outcome !== "reussi" && <Badge tone="danger">{r.outcome === "abandon" ? "Abandon" : "Échec"}</Badge>}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader title="Actions rapides" icon={<Sparkles className="h-5 w-5" />} />
            <div className="grid gap-2 px-5 pb-5">
              <QuickAction href="/admin/configuration#comptes" icon={UserCog} label="Gérer les utilisateurs" />
              <QuickAction href="/admin/configuration#fournisseurs" icon={Cloud} label="Configurer les fournisseurs IA" />
              <QuickAction onClick={() => downloadExport("kpis", days)} icon={Download} label="Télécharger le rapport (CSV)" />
              <QuickAction href="/admin/journaux" icon={FileSearch} label="Accéder aux journaux" />
              <QuickAction href="/admin/services-ia" icon={ShieldCheck} label="Tester la passerelle IA" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Family({ title, icon: Icon, rows }: { title: string; icon: typeof Users; rows: { label: string; value: string; sub?: string; def: string }[] }) {
  return (
    <div className="bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-extrabold text-brand-900">
        <Icon className="h-4 w-4 text-brand-600" /> {title}
      </p>
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <dt className="flex items-center gap-1 text-sm text-muted">
              {r.label}
              <InfoTip>{r.def}</InfoTip>
            </dt>
            <dd className="text-right">
              <span className="whitespace-nowrap font-extrabold text-ink">{r.value}</span>
              {r.sub && <span className="block text-xs text-muted">{r.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuickAction({ href, onClick, icon: Icon, label }: { href?: string; onClick?: () => void; icon: typeof Users; label: string }) {
  const cls = "flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm font-bold text-ink transition-colors hover:border-brand-200 hover:bg-brand-50";
  const content = (
    <>
      <Icon className="h-4 w-4 text-brand-600" /> <span className="flex-1 text-left">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted" />
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}
