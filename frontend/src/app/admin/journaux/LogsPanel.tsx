"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Lock, ScrollText, Search } from "lucide-react";
import { qs } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDateTime } from "@/lib/format";
import type { AiCall } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from "@/components/ui";
import { CallStatus } from "../shared";

interface LogsResponse {
  calls: AiCall[];
  total: number;
  page: number;
  pages: number;
  providers: string[];
}

// Journaux techniques des appels IA (filtrables, prompts anonymisés)
export function LogsPanel() {
  const [filters, setFilters] = useState({ days: "7", provider: "", status: "", q: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AiCall | null>(null);
  const { data, loading } = useApi<LogsResponse>(`/admin/ai-calls${qs({ ...filters, page, limit: 20 })}`);

  const update = (k: keyof typeof filters, v: string) => {
    setFilters({ ...filters, [k]: v });
    setPage(1);
  };

  return (
    <div className="fade-up">
      <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[160px_200px_160px_1fr]">
        <Select aria-label="Période" value={filters.days} onChange={(e) => update("days", e.target.value)}>
          <option value="1">Dernières 24 h</option>
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="">Tout</option>
        </Select>
        <Select aria-label="Service" value={filters.provider} onChange={(e) => update("provider", e.target.value)}>
          <option value="">Tous les services</option>
          {data?.providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select aria-label="Statut" value={filters.status} onChange={(e) => update("status", e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="succes">Succès</option>
          <option value="erreur">Erreur</option>
        </Select>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            update("q", search);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Rechercher" placeholder="Rechercher (tâche, prompt, erreur)…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </form>
      </Card>

      <Card className="overflow-hidden">
        {loading && !data ? (
          <Spinner />
        ) : !data?.calls.length ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title="Aucun appel" text="Aucun appel IA ne correspond à ces filtres." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Date / heure</th>
                  <th className="px-5 py-3">Tâche</th>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Statut</th>
                  <th className="px-5 py-3">Temps</th>
                  <th className="px-5 py-3">Jetons d&apos;anonymisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.calls.map((c) => (
                  <tr key={c._id} onClick={() => setDetail(c)} className="cursor-pointer hover:bg-brand-50/50">
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">{fmtDateTime(c.createdAt)}</td>
                    <td className="px-5 py-3">{c.task}</td>
                    <td className="px-5 py-3 text-muted">{c.provider}</td>
                    <td className="px-5 py-3">
                      <CallStatus call={c} />
                    </td>
                    <td className="px-5 py-3 text-muted">{c.latencyMs != null ? `${(c.latencyMs / 1000).toFixed(1)} s` : "—"}</td>
                    <td className="px-5 py-3">
                      {c.tokens?.length ? (
                        <span className="font-mono text-xs text-violet-500">{c.tokens.join(" ")}</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-muted">
            <span>
              {data.total.toLocaleString("fr-FR")} appel(s) · page {data.page} / {data.pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Page précédente">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)} aria-label="Page suivante">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Détail de l'appel" wide>
        {detail && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(
                [
                  ["Date", fmtDateTime(detail.createdAt)],
                  ["Tâche", detail.task],
                  ["Capacité", detail.capability.toUpperCase()],
                  ["Service", detail.provider],
                  ["Modèle", detail.model],
                  ["Temps de réponse", detail.latencyMs != null ? `${detail.latencyMs} ms` : "—"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-canvas p-3">
                  <dt className="text-xs font-bold uppercase text-muted">{k}</dt>
                  <dd className="font-semibold text-ink">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <CallStatus call={detail} />
            {detail.error && <p className="rounded-xl bg-danger-50 p-3 font-semibold text-danger-600">{detail.error}</p>}
            {detail.promptPreview && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-muted">
                  <Lock className="h-3.5 w-3.5" /> Prompt envoyé (anonymisé)
                </p>
                <pre className="whitespace-pre-wrap rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-emerald-300">{detail.promptPreview}</pre>
              </div>
            )}
            {!!detail.tokens?.length && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tokens.map((t) => (
                  <Badge key={t} tone="violet">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
