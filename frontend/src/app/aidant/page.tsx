"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  HeartPulse,
  Pill,
  RefreshCw,
  Stethoscope,
  Utensils,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { fmtDayCap, fmtRelative, fmtShort, fmtTime } from "@/lib/format";
import type { Dashboard } from "@/lib/types";
import { Avatar, Badge, Button, Card, CardHeader, ErrorBox, IconBubble, Spinner } from "@/components/ui";
import { useCurrentSenior } from "./SeniorContext";
import { ALERT_STYLE } from "./alertStyle";
import { MemoryStatsCard } from "@/components/souvenirs/MemoryStatsCard";

export default function AidantDashboard() {
  const { user } = useAuth();
  const { senior, base } = useCurrentSenior();
  const { data, error, loading, reload } = useApi<Dashboard>(`${base}/dashboard`);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const firstName = user?.name.split(" ")[0];
  const { intakes, nextEvent } = data;

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-900 sm:text-[28px]">Bonjour {firstName},</h1>
          <p className="mt-1 text-[15px] text-muted">
            Voici un aperçu de la situation de {senior.firstName} — {fmtDayCap(new Date())}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Actualiser
        </Button>
      </div>

      {/* Carte du senior */}
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <Avatar name={`${senior.firstName} ${senior.lastName}`} size="xl" />
        <div className="flex-1">
          <p className="text-xl font-extrabold text-ink">
            {senior.firstName} {senior.lastName}
          </p>
          <p className="text-sm text-muted">
            {senior.age ? `${senior.age} ans` : "Âge non renseigné"}
            {senior.photoUrl ? " · Connexion par reconnaissance faciale activée" : " · Photo du visage à ajouter pour activer la connexion"}
          </p>
          {senior.doctor?.name && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Stethoscope className="h-4 w-4" /> {senior.doctor.name}
            </p>
          )}
        </div>
        <Badge tone={data.online ? "ok" : "muted"}>
          <span className={`h-2 w-2 rounded-full ${data.online ? "bg-ok-500" : "bg-slate-400"}`} />
          {data.online ? "En ligne" : "Hors ligne"}
        </Badge>
      </Card>

      {/* Indicateurs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard href="/aidant/suivi" icon={<Pill className="h-5 w-5" />} tone="ok" label="Prises du jour" value={`${intakes.confirmed} / ${intakes.total}`} />
        <StatCard href="/aidant/agenda" icon={<CalendarDays className="h-5 w-5" />} tone="brand" label="Rendez-vous aujourd'hui" value={String(data.todayEvents)} />
        <StatCard href="/aidant/alertes" icon={<Bell className="h-5 w-5" />} tone="danger" label="Alertes non lues" value={String(data.unreadAlerts)} />
      </div>

      {/* Module F4 — Souvenirs : écoutes, quiz et souvenirs à valider */}
      <MemoryStatsCard base={base} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Prochain rendez-vous */}
        <Card>
          <CardHeader title="Prochain rendez-vous" icon={<CalendarDays className="h-5 w-5" />} />
          <div className="px-5 pb-5">
            {nextEvent ? (
              <div className="rounded-xl bg-brand-50/60 p-4">
                <p className="text-lg font-extrabold text-ink">{nextEvent.title}</p>
                <p className="mt-1 font-semibold text-brand-700">
                  {fmtShort(nextEvent.startAt)} · {fmtTime(nextEvent.startAt)}
                </p>
                {nextEvent.location && <p className="text-sm text-muted">{nextEvent.location}</p>}
              </div>
            ) : (
              <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Aucun rendez-vous à venir.</p>
            )}
            <Link href="/aidant/agenda" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
              Voir tout l&apos;agenda <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>

        {/* Dernières alertes */}
        <Card>
          <CardHeader
            title="Dernières alertes"
            icon={<AlertTriangle className="h-5 w-5" />}
            action={
              <Link href="/aidant/alertes" className="text-sm font-bold text-brand-600 hover:underline">
                Tout voir
              </Link>
            }
          />
          <ul className="divide-y divide-line px-5 pb-3">
            {data.alerts.length === 0 && <li className="py-4 text-sm text-muted">Aucune alerte. Tout va bien.</li>}
            {data.alerts.map((a) => {
              const s = ALERT_STYLE[a.type];
              return (
                <li key={a._id} className="flex items-start gap-3 py-3">
                  <IconBubble tone={s.tone} size="sm">
                    <s.icon className="h-4 w-4" />
                  </IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-bold text-ink">
                      {a.title} {!a.read && <span className="h-2 w-2 rounded-full bg-danger-500" aria-label="non lue" />}
                    </p>
                    <p className="truncate text-xs text-muted">{a.message}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted">{fmtRelative(a.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Prochaines activités */}
        <Card>
          <CardHeader title="Prochaines activités" icon={<Clock className="h-5 w-5" />} />
          <ul className="space-y-2 px-5 pb-5">
            {data.upcoming.length === 0 && <li className="text-sm text-muted">Rien de prévu pour le moment.</li>}
            {data.upcoming.map((u, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <IconBubble tone={u.kind === "prise" ? "ok" : u.kind === "repas" ? "warn" : "brand"} size="sm">
                  {u.kind === "prise" ? <Pill className="h-4 w-4" /> : u.kind === "repas" ? <Utensils className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                </IconBubble>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{u.title}</p>
                  <p className="truncate text-xs text-muted">{u.detail}</p>
                </div>
                <span className="text-right text-xs font-bold text-brand-700">
                  {fmtShort(u.at)}
                  <br />
                  {fmtTime(u.at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Synthèse hebdomadaire */}
        <Card className="flex flex-col">
          <CardHeader title="Synthèse hebdomadaire" icon={<FileText className="h-5 w-5" />} subtitle={data.lastSummary ? `Générée le ${fmtShort(data.lastSummary.createdAt)}` : undefined} />
          <div className="flex flex-1 flex-col px-5 pb-5">
            {data.lastSummary ? (
              <>
                <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-ink">{data.lastSummary.content}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="ok">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Observance {data.lastSummary.stats.adherence} %
                  </Badge>
                  <Badge tone="danger">{data.lastSummary.stats.intakesMissed} manquée(s)</Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">Aucune synthèse pour le moment.</p>
            )}
            <Link href="/aidant/synthese" className="mt-auto pt-4">
              <Button className="w-full" variant="secondary">
                Consulter la synthèse
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-50 to-brand-100/70 px-6 py-5">
        <HeartPulse className="h-7 w-7 text-brand-600" />
        <p className="font-bold text-brand-800">Prenez soin de vous et de ceux que vous aimez.</p>
      </div>
    </div>
  );
}

function StatCard({ href, icon, tone, label, value }: { href: string; icon: React.ReactNode; tone: "ok" | "brand" | "danger"; label: string; value: string }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-4 p-5 transition-shadow hover:shadow-pop">
        <IconBubble tone={tone} size="lg">
          {icon}
        </IconBubble>
        <div>
          <p className="text-sm font-semibold text-muted">{label}</p>
          <p className="text-3xl font-black text-ink">{value}</p>
        </div>
      </Card>
    </Link>
  );
}
