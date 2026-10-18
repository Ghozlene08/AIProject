"use client";

import { ArrowDown, ArrowUp, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AiProvider } from "@/lib/types";
import { Badge, Card, CardHeader, IconBubble, Input, Spinner, Toggle } from "@/components/ui";
import { CAPABILITIES } from "../shared";

type Provider = AiProvider & { dailyQuota?: number | null };

function ProviderState({ p }: { p: Provider }) {
  if (!p.enabled) return <Badge tone="muted">Désactivé</Badge>;
  if (p.simulateFailure) return <Badge tone="danger">Panne simulée</Badge>;
  if (!p.configured) return <Badge tone="warn">Clé API absente</Badge>;
  return (
    <Badge tone="ok">
      <span className="h-1.5 w-1.5 rounded-full bg-ok-500" /> Opérationnel
    </Badge>
  );
}

export function ProvidersPanel() {
  const { data, loading, reload, setData } = useApi<{ providers: Provider[] }>("/admin/providers");

  async function update(p: Provider, patch: Partial<Provider>) {
    // Mise à jour optimiste puis synchronisation
    setData((d) => d && { providers: d.providers.map((x) => (x._id === p._id ? { ...x, ...patch } : x)) });
    await api.put(`/admin/providers/${p._id}`, patch).finally(reload);
  }

  async function move(list: Provider[], index: number, dir: -1 | 1) {
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
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-warn-500/30 bg-warn-50 p-4 text-sm text-warn-600">
        <Zap className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <b>Démonstration :</b> activez « Panne simulée » sur Groq, puis lancez le test dans « Services IA » : la passerelle bascule vers le fournisseur suivant sans erreur visible
          pour le senior. Les clés API se configurent dans <code className="font-mono">backend/.env</code>.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {(Object.keys(CAPABILITIES) as Provider["capability"][]).map((cap) => {
          const list = providers.filter((p) => p.capability === cap).sort((a, b) => a.priority - b.priority);
          if (!list.length) return null;
          const C = CAPABILITIES[cap];
          return (
            <Card key={cap}>
              <CardHeader title={C.label} icon={<C.icon className="h-5 w-5" />} subtitle="Ordre de bascule : du haut vers le bas" />
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
                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-3 text-sm">
                      <label className="flex items-center gap-2 font-semibold text-ink">
                        <Toggle label={`Activer ${p.name}`} checked={p.enabled} onChange={(v) => update(p, { enabled: v })} /> Activé
                      </label>
                      {cap === "llm" && (
                        <label className="flex items-center gap-2 font-semibold text-ink">
                          <Toggle label={`Simuler une panne de ${p.name}`} checked={p.simulateFailure} onChange={(v) => update(p, { simulateFailure: v })} /> Panne simulée
                        </label>
                      )}
                      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                        Quota / jour
                        <Input
                          type="number"
                          min={0}
                          defaultValue={p.dailyQuota ?? ""}
                          placeholder="illimité"
                          aria-label={`Quota quotidien de ${p.name}`}
                          className="h-9 w-24 text-sm"
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v !== (p.dailyQuota ?? null)) update(p, { dailyQuota: v });
                          }}
                        />
                      </label>
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
    </div>
  );
}
