"use client";

import { Database, Globe, Server } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { AccountSettings } from "@/components/AccountSettings";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";

export default function AdminParametresPage() {
  const health = useApi<{ status: string; database: string }>("/health");
  const ok = health.data?.status === "ok";

  return (
    <div className="fade-up space-y-6">
      <PageHeader title="Paramètres" subtitle="Votre compte administrateur et l'état de la plateforme" />

      <Card>
        <CardHeader title="État du système" icon={<Server className="h-5 w-5" />} />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
          <div className="rounded-xl bg-canvas p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-muted">
              <Server className="h-4 w-4" /> API Express
            </p>
            <div className="mt-2">{health.loading ? <Badge tone="muted">…</Badge> : <Badge tone={ok ? "ok" : "danger"}>{ok ? "En ligne" : "Injoignable"}</Badge>}</div>
          </div>
          <div className="rounded-xl bg-canvas p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-muted">
              <Database className="h-4 w-4" /> MongoDB
            </p>
            <div className="mt-2">
              <Badge tone={health.data?.database === "connectée" ? "ok" : "danger"}>{health.data?.database ?? "inconnue"}</Badge>
            </div>
          </div>
          <div className="rounded-xl bg-canvas p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-muted">
              <Globe className="h-4 w-4" /> Adresse de l&apos;API
            </p>
            <p className="mt-2 truncate font-mono text-xs text-ink">{API_URL}</p>
          </div>
        </div>
      </Card>

      <AccountSettings withNotifications={false} />
    </div>
  );
}
