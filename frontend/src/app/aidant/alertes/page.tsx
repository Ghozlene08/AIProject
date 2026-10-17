"use client";

import { useState } from "react";
import { BellOff, CheckCheck, Send } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDateTime } from "@/lib/format";
import type { Alert, AlertType } from "@/lib/types";
import { Badge, Button, Card, EmptyState, IconBubble, PageHeader, Spinner, cx } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";
import { ALERT_STYLE } from "../alertStyle";

const FILTERS: { value: "" | "unread" | AlertType; label: string }[] = [
  { value: "", label: "Toutes" },
  { value: "unread", label: "Non lues" },
  { value: "prise_manquee", label: "Prises manquées" },
  { value: "sos", label: "SOS" },
  { value: "rdv", label: "Rendez-vous" },
  { value: "symptome", label: "Symptômes" },
  { value: "synthese", label: "Synthèses" },
];

export default function AlertesPage() {
  const { senior, base, refreshUnread } = useCurrentSenior();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("");
  const query = filter === "unread" ? qs({ unread: true }) : qs({ type: filter });
  const { data, loading, reload } = useApi<{ alerts: Alert[] }>(`${base}/alerts${query}`);

  async function toggleRead(a: Alert) {
    await api.patch(`${base}/alerts/${a._id}`, { read: !a.read });
    reload();
    refreshUnread();
  }

  async function readAll() {
    await api.patch(`${base}/alerts/read-all`);
    reload();
    refreshUnread();
  }

  const alerts = data?.alerts ?? [];

  return (
    <div className="fade-up">
      <PageHeader
        title="Alertes"
        subtitle={`Événements importants concernant ${senior.firstName}`}
        action={
          <Button variant="outline" onClick={readAll}>
            <CheckCheck className="h-4 w-4" /> Tout marquer comme lu
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              filter === f.value ? "bg-brand-600 text-white" : "bg-white text-muted shadow-card hover:text-brand-700",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        {loading && !data ? (
          <Spinner />
        ) : alerts.length === 0 ? (
          <EmptyState icon={<BellOff className="h-6 w-6" />} title="Aucune alerte" text="Rien à signaler pour ce filtre." />
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => {
              const s = ALERT_STYLE[a.type];
              return (
                <li key={a._id} className={cx("flex items-start gap-4 px-5 py-4", !a.read && "bg-brand-50/40")}>
                  <IconBubble tone={s.tone}>
                    <s.icon className="h-5 w-5" />
                  </IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      {a.title}
                      {a.severity === "haute" && <Badge tone="danger">Prioritaire</Badge>}
                      {a.sentTelegram && (
                        <Badge tone="brand">
                          <Send className="h-3 w-3" /> Telegram
                        </Badge>
                      )}
                    </p>
                    {a.message && <p className="mt-0.5 text-sm text-muted">{a.message}</p>}
                    <p className="mt-1 text-xs font-semibold text-slate-400">{fmtDateTime(a.createdAt)}</p>
                  </div>
                  <button onClick={() => toggleRead(a)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50">
                    {a.read ? "Marquer non lue" : "Marquer lue"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
