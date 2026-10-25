"use client";

import { useState } from "react";
import { AlertOctagon, CheckCircle2, Cpu, Gauge, LifeBuoy, Play, ShieldCheck, Shuffle, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AiCall } from "@/lib/types";
import { Badge, Button, Card, CardHeader, ErrorBox, Spinner, cx } from "@/components/ui";
import { Legend, LineChart, SERIES } from "@/components/admin/charts";
import { AdminHeader, CAPABILITIES, InfoTip, dayLabel, fmtNum, fmtSec, usePeriod } from "../shared";
import type { AiServices } from "../types";

interface TestResult {
  text: string;
  provider: string;
  fallback: boolean;
  totalMs: number;
  log: AiCall;
}

export default function ServicesIaPage() {
  const { days } = usePeriod();
  const { data, loading, error, reload } = useApi<AiServices>(`/admin/ai-services?days=${days}`);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  async function runTest() {
    setTesting(true);
    setTestError("");
    try {
      setTest(await api.post<TestResult>("/admin/ai/test"));
      reload();
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  if (loading && !data) return <Spinner label="Analyse des services IA…" />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const q = data.quality;
  const llm = data.byProvider.filter((p) => p.capability === "llm");

  return (
    <div className={cx("fade-up space-y-6", loading && "opacity-60")}>
      <AdminHeader title="Services IA" subtitle="Qualité et performance globale : disponibilité, latence, secours et quotas">
        <span className={cx("flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold", data.status.level === "ok" ? "bg-ok-50 text-ok-600" : "bg-warn-50 text-warn-600")} title={data.status.detail}>
          {data.status.level === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertOctagon className="h-4 w-4" />} {data.status.label}
        </span>
      </AdminHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ShieldCheck} label="Disponibilité globale" value={`${fmtNum(q.errorRate != null ? 100 - q.errorRate : null)} %`} sub={`${q.aiCalls.toLocaleString("fr-FR")} appels IA`} def="Part des appels aux services IA terminés sans erreur, toutes capacités confondues." />
        <Kpi
          icon={Timer}
          label="Latence P95 (réponse vocale)"
          value={fmtSec(q.latencyP95)}
          sub={`P50 ${fmtSec(q.latencyP50)} · objectif < ${fmtSec(data.target)}`}
          alert={(q.latencyP95 ?? 0) > data.target}
          def="95 % des réponses vocales arrivent en moins de ce délai, mesuré de la fin de la demande au début de la réponse."
        />
        <Kpi icon={Gauge} label="Réponses en moins de 4 s" value={`${fmtNum(q.under4sRate)} %`} sub="exigence : 95 % des demandes" alert={(q.under4sRate ?? 100) < 95} def="Part des interactions vocales dont la réponse a commencé en moins de 4 secondes." />
        <Kpi
          icon={LifeBuoy}
          label="Bascule / récupération"
          value={`${fmtNum(q.fallbackRate)} % / ${fmtNum(q.recoveryRate)} %`}
          sub="secours LLM via la passerelle"
          def="Bascule : appels LLM réussis servis par un fournisseur de secours. Récupération : erreurs du principal rattrapées par un secours."
        />
      </div>

      <Card>
        <CardHeader
          title="Latence de la réponse vocale"
          subtitle="Médiane (P50) et 95e centile (P95) par jour, comparés à l'objectif du cahier des charges"
          icon={<Timer className="h-5 w-5" />}
          action={
            <Legend
              items={[
                { label: "P50", color: SERIES[2] },
                { label: "P95", color: SERIES[0] },
                { label: "Objectif 4 s", color: "#e5484d", dashed: true },
              ]}
            />
          }
        />
        <div className="px-3 pb-4">
          <LineChart
            height={260}
            area={false}
            labels={data.voiceLatency.map((d) => dayLabel(d.date))}
            format={(v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`}
            target={{ value: data.target / 1000, label: "Objectif 4 s" }}
            series={[
              { key: "p50", label: "P50", color: SERIES[2], values: data.voiceLatency.map((d) => (d.p50 != null ? d.p50 / 1000 : null)) },
              { key: "p95", label: "P95", color: SERIES[0], values: data.voiceLatency.map((d) => (d.p95 != null ? d.p95 / 1000 : null)) },
            ]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Performance par capacité IA" subtitle="Chaque capacité dispose d'un fournisseur principal et d'une solution de secours" icon={<Cpu className="h-5 w-5" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5">Capacité</th>
                <th className="px-3 py-2.5">Principal</th>
                <th className="px-3 py-2.5">Secours</th>
                <th className="px-3 py-2.5 text-right">Appels</th>
                <th className="px-3 py-2.5 text-right">Disponibilité</th>
                <th className="px-3 py-2.5 text-right">P50</th>
                <th className="px-3 py-2.5 text-right">P95</th>
                <th className="px-5 py-2.5">Bascule / récupération</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.byCapability.map((c) => {
                const C = CAPABILITIES[c.capability];
                return (
                  <tr key={c.capability}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <C.icon className="h-4 w-4 text-brand-600" /> {C.short}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink">{c.principal}</td>
                    <td className="px-3 py-3 text-muted">{c.fallbacks.join(" / ") || "—"}</td>
                    <td className="px-3 py-3 text-right text-muted">{c.calls.toLocaleString("fr-FR")}</td>
                    <td className={cx("px-3 py-3 text-right font-bold", (c.availability ?? 100) >= 99 ? "text-ok-600" : "text-warn-600")}>{fmtNum(c.availability)} %</td>
                    <td className="px-3 py-3 text-right text-ink">{fmtSec(c.latencyP50)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-ink">{fmtSec(c.latencyP95)}</td>
                    <td className="px-5 py-3 text-muted">{c.fallbackNote ?? `${fmtNum(c.fallbackRate)} % / ${fmtNum(c.recoveryRate)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card id="quotas" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            title="Fournisseurs : erreurs et quotas"
            subtitle="Consommation d'aujourd'hui par rapport au quota gratuit configuré"
            icon={<Gauge className="h-5 w-5" />}
            action={<InfoTip>Les quotas sont saisis dans Configuration → Fournisseurs IA. Ils doivent être confirmés auprès de chaque fournisseur (offres gratuites).</InfoTip>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">Fournisseur</th>
                  <th className="px-3 py-2.5">Rôle</th>
                  <th className="px-3 py-2.5 text-right">Appels</th>
                  <th className="px-3 py-2.5 text-right">Erreurs</th>
                  <th className="px-5 py-2.5">Quota du jour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.byProvider.map((p) => (
                  <tr key={p._id} className={p.enabled ? "" : "opacity-50"}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-xs text-muted">{CAPABILITIES[p.capability].short}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={p.role === "principal" ? "brand" : "muted"}>{p.role === "principal" ? "Principal" : "Secours"}</Badge>
                      {p.simulateFailure && <Badge tone="danger" className="ml-1">Panne simulée</Badge>}
                    </td>
                    <td className="px-3 py-3 text-right text-muted">{p.calls.toLocaleString("fr-FR")}</td>
                    <td className={cx("px-3 py-3 text-right font-bold", (p.errorRate ?? 0) > 5 ? "text-danger-600" : "text-ink")}>{p.calls ? `${fmtNum(p.errorRate)} %` : "—"}</td>
                    <td className="px-5 py-3">
                      {p.dailyQuota ? (
                        <div className="min-w-40">
                          <div className="flex justify-between text-xs text-muted">
                            <span>
                              {p.usedToday.toLocaleString("fr-FR")} / {p.dailyQuota.toLocaleString("fr-FR")}
                            </span>
                            <b className="text-ink">{fmtNum(p.quotaPct)} %</b>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-canvas">
                            <div
                              className={cx("h-2 rounded-full", (p.quotaPct ?? 0) >= 80 ? "bg-danger-500" : "bg-brand-500")}
                              style={{ width: `${Math.min(100, p.quotaPct ?? 0)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">Sans quota (local ou navigateur)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Tester la passerelle IA" icon={<Shuffle className="h-5 w-5" />} subtitle="Anonymisation, bascule de secours et validation" />
          <div className="space-y-4 px-5 pb-5">
            <p className="rounded-xl bg-canvas p-3 text-sm text-ink">« Bonjour, je suis Marie Dupont. Rappelle-moi d&apos;appeler le Dr Ben Salem au 71 234 567 demain matin. »</p>
            <p className="text-xs text-muted">
              Ordre de bascule LLM : {llm.map((p) => `${p.name}${p.simulateFailure ? " (panne)" : ""}`).join(" → ")} → Générateur local
            </p>
            <Button onClick={runTest} loading={testing} className="w-full">
              <Play className="h-4 w-4" /> Lancer le test
            </Button>
            <ErrorBox>{testError}</ErrorBox>
            {test && (
              <div className="space-y-3 rounded-xl border border-line p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="violet">{test.provider}</Badge>
                  {test.fallback && <Badge tone="warn">Bascule de secours</Badge>}
                  <Badge tone="muted">{test.totalMs} ms</Badge>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted">Prompt journalisé (anonymisé)</p>
                  <p className="mt-1 rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-emerald-300">{test.log.promptPreview ?? "Aperçu désactivé (Configuration → Confidentialité)"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-muted">Réponse validée</p>
                  <p className="mt-1 text-ink">{test.text}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, def, alert }: { icon: typeof Cpu; label: string; value: string; sub: string; def: string; alert?: boolean }) {
  return (
    <Card className={cx("p-5", alert && "ring-2 ring-danger-500/40")}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Icon className="h-4 w-4 text-brand-600" /> {label}
        <InfoTip>{def}</InfoTip>
      </p>
      <p className={cx("mt-2 text-3xl font-black", alert ? "text-danger-600" : "text-ink")}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Card>
  );
}
