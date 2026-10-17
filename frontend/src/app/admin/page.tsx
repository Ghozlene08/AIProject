"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Gauge, PhoneCall, Play, RefreshCw, Shuffle, ShieldCheck, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtTime } from "@/lib/format";
import type { AdminOverview, AiCall } from "@/lib/types";
import { Sparkline } from "@/components/charts";
import { Badge, Button, Card, CardHeader, ErrorBox, IconBubble, PageHeader, Spinner } from "@/components/ui";
import { CAPABILITIES, CallStatus, ProviderState } from "./shared";

interface TestResult {
  text: string;
  provider: string;
  fallback: boolean;
  totalMs: number;
  log: AiCall;
}

export default function SupervisionPage() {
  const { data, loading, error, reload } = useApi<AdminOverview>("/admin/overview");
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

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const { today, hourly } = data;
  const kpis = [
    { label: "Appels aujourd'hui", value: today.calls.toLocaleString("fr-FR"), icon: PhoneCall, tone: "brand" as const, series: hourly.map((h) => h.calls), color: "#2f74e6" },
    { label: "Taux de succès", value: `${today.successRate.toLocaleString("fr-FR")} %`, icon: ShieldCheck, tone: "ok" as const, series: hourly.map((h) => (h.calls ? ((h.calls - h.errors) / h.calls) * 100 : 100)), color: "#1f9d5c" },
    { label: "Temps de réponse moyen", value: `${(today.latencyMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`, icon: Timer, tone: "violet" as const, series: hourly.map((h) => h.latencyMs), color: "#7c5cfc" },
    { label: "Taux d'erreur", value: `${today.errorRate.toLocaleString("fr-FR")} %`, icon: AlertTriangle, tone: "danger" as const, series: hourly.map((h) => h.errors), color: "#e5484d" },
  ];
  const llm = data.providers.filter((p) => p.capability === "llm");
  // Comme sur la maquette : LLM principal, LLM de secours, STT et TTS principaux
  const mainProviders = [
    llm[0],
    llm.find((p) => p.role === "secours"),
    data.providers.find((p) => p.capability === "stt" && p.role === "principal"),
    data.providers.find((p) => p.capability === "tts" && p.role === "principal"),
  ].filter((p) => p !== undefined);

  return (
    <div className="fade-up space-y-6">
      <PageHeader
        title="Supervision IA"
        subtitle="Suivi des appels et de la qualité des services d'intelligence artificielle"
        action={
          <Button variant="outline" size="sm" onClick={reload} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Actualiser
          </Button>
        }
      />

      {/* État des services */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {mainProviders.map((p) => {
          const Cap = CAPABILITIES[p.capability].icon;
          return (
            <Card key={p._id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <IconBubble tone={p.operational ? "ok" : p.simulateFailure ? "danger" : "warn"}>
                  <Cap className="h-5 w-5" />
                </IconBubble>
                <ProviderState p={p} />
              </div>
              <p className="mt-3 font-extrabold text-ink">
                {p.name} <span className="text-sm font-semibold text-muted">({p.role})</span>
              </p>
              <p className="truncate text-xs text-muted">{p.model}</p>
              <p className="mt-3 text-2xl font-black text-ink">{p.successRate != null ? `${p.successRate.toLocaleString("fr-FR")} %` : "—"}</p>
              <p className="text-xs text-muted">
                succès sur 7 jours · {p.calls ?? 0} appels{p.latencyMs ? ` · ${(p.latencyMs / 1000).toFixed(1)} s` : ""}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Indicateurs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <div className="flex items-center gap-3">
              <IconBubble tone={k.tone} size="sm">
                <k.icon className="h-4 w-4" />
              </IconBubble>
              <p className="text-sm font-semibold text-muted">{k.label}</p>
            </div>
            <p className="mt-3 text-3xl font-black text-ink">{k.value}</p>
            <div className="mt-2">
              <Sparkline values={k.series} color={k.color} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Derniers appels */}
        <Card>
          <CardHeader
            title="Derniers appels"
            icon={<Gauge className="h-5 w-5" />}
            action={
              <Link href="/admin/journaux" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
                Voir tous les journaux <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">Heure</th>
                  <th className="px-5 py-2.5">Tâche</th>
                  <th className="px-5 py-2.5">Service</th>
                  <th className="px-5 py-2.5">Statut</th>
                  <th className="px-5 py-2.5 text-right">Temps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recent.map((c) => (
                  <tr key={c._id}>
                    <td className="px-5 py-3 font-semibold text-ink">{fmtTime(c.createdAt)}</td>
                    <td className="px-5 py-3">{c.task}</td>
                    <td className="px-5 py-3 text-muted">{c.provider}</td>
                    <td className="px-5 py-3">
                      <CallStatus call={c} />
                    </td>
                    <td className="px-5 py-3 text-right text-muted">{c.latencyMs != null ? `${(c.latencyMs / 1000).toFixed(1)} s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Test de la passerelle */}
        <Card>
          <CardHeader title="Tester la passerelle IA" icon={<Shuffle className="h-5 w-5" />} subtitle="Anonymisation, bascule de secours et validation" />
          <div className="space-y-4 px-5 pb-5">
            <p className="rounded-xl bg-canvas p-3 text-sm text-ink">
              « Bonjour, je suis Marie Dupont. Rappelle-moi d&apos;appeler le Dr Ben Salem au 71 234 567 demain matin. »
            </p>
            <p className="text-xs text-muted">
              Ordre de bascule LLM : {llm.map((p) => `${p.name}${p.simulateFailure ? " (panne)" : !p.configured ? " (sans clé)" : ""}`).join(" → ")} → Générateur local
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
                  <p className="mt-1 rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-emerald-300">{test.log.promptPreview}</p>
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

      <p className="text-center text-xs text-muted">
        {data.counts.users} comptes · {data.counts.seniors} seniors suivis · {today.fallbacks} bascule(s) de secours aujourd&apos;hui
      </p>
    </div>
  );
}
