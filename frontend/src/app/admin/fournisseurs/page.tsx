"use client";

import { ArrowDown, ArrowUp, Info, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AiProvider } from "@/lib/types";
import { Badge, Card, CardHeader, IconBubble, PageHeader, Spinner, Toggle } from "@/components/ui";
import { CAPABILITIES, ProviderState } from "../shared";

export default function FournisseursPage() {
  const { data, loading, reload, setData } = useApi<{ providers: AiProvider[] }>("/admin/providers");

  async function update(p: AiProvider, patch: Partial<AiProvider>) {
    // Mise à jour optimiste puis synchronisation
    setData((d) => d && { providers: d.providers.map((x) => (x._id === p._id ? { ...x, ...patch } : x)) });
    await api.put(`/admin/providers/${p._id}`, patch).finally(reload);
  }

  async function move(list: AiProvider[], index: number, dir: -1 | 1) {
    const other = list[index + dir];
    if (!other) return;
    const p = list[index];
    await Promise.all([
      api.put(`/admin/providers/${p._id}`, { priority: other.priority, role: other.role }),
      api.put(`/admin/providers/${other._id}`, { priority: p.priority, role: p.role }),
    ]);
    reload();
  }

  if (loading && !data) return <Spinner />;
  const providers = data?.providers ?? [];

  return (
    <div className="fade-up">
      <PageHeader title="Fournisseurs IA" subtitle="Chaque capacité dispose d'un fournisseur principal et d'un ou plusieurs secours" />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warn-500/30 bg-warn-50 p-4 text-sm text-warn-600">
        <Zap className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <b>Démonstration :</b> activez « Panne simulée » sur Groq puis lancez le test depuis la Supervision : la passerelle bascule vers le
          fournisseur suivant sans erreur visible pour le senior. Les clés API se configurent dans <code className="font-mono">backend/.env</code>.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {(Object.keys(CAPABILITIES) as AiProvider["capability"][]).map((cap) => {
          const list = providers.filter((p) => p.capability === cap).sort((a, b) => a.priority - b.priority);
          if (!list.length) return null;
          const C = CAPABILITIES[cap];
          return (
            <Card key={cap}>
              <CardHeader title={C.label} icon={<C.icon className="h-5 w-5" />} />
              <ul className="space-y-3 px-5 pb-5">
                {list.map((p, i) => (
                  <li key={p._id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <IconBubble tone={i === 0 ? "brand" : "muted"} size="sm">
                        <span className="text-sm font-black">{i + 1}</span>
                      </IconBubble>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-extrabold text-ink">
                          {p.name}
                          <Badge tone={p.role === "principal" ? "brand" : "muted"}>{p.role === "principal" ? "Principal" : "Secours"}</Badge>
                        </p>
                        <p className="font-mono text-xs text-muted">{p.model}</p>
                        {p.description && <p className="mt-1 text-xs text-muted">{p.description}</p>}
                      </div>
                      <ProviderState p={p} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-sm">
                      <label className="flex items-center gap-2 font-semibold text-ink">
                        <Toggle label={`Activer ${p.name}`} checked={p.enabled} onChange={(v) => update(p, { enabled: v })} /> Activé
                      </label>
                      {cap === "llm" && (
                        <label className="flex items-center gap-2 font-semibold text-ink">
                          <Toggle label={`Simuler une panne de ${p.name}`} checked={p.simulateFailure} onChange={(v) => update(p, { simulateFailure: v })} /> Panne simulée
                        </label>
                      )}
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => move(list, i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-muted hover:bg-brand-50 disabled:opacity-30" aria-label="Monter la priorité">
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button onClick={() => move(list, i, 1)} disabled={i === list.length - 1} className="rounded-lg p-1.5 text-muted hover:bg-brand-50 disabled:opacity-30" aria-label="Baisser la priorité">
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
        <Info className="h-3.5 w-3.5" /> Budget 0 € : uniquement des offres gratuites. Sans clé, le générateur local garantit une réponse.
      </p>
    </div>
  );
}
