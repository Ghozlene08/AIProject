"use client";

import { useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, Pill, X } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { addDays, endOfDay, fmtDayCap, fmtTime, startOfDay, toDateInput } from "@/lib/format";
import type { AdherenceDay, AgendaEvent, Intake, IntakeStatus } from "@/lib/types";
import { DayBars } from "@/components/charts";
import { Badge, Card, CardHeader, EmptyState, IconBubble, PageHeader, Spinner, Tabs } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";
import { IntakeBadge } from "../IntakeBadge";

export default function SuiviPage() {
  const { senior, base } = useCurrentSenior();
  const [day, setDay] = useState(() => startOfDay());
  const [tab, setTab] = useState<"prises" | "rdv">("prises");
  const range = qs({ from: day.toISOString(), to: endOfDay(day).toISOString() });
  const intakes = useApi<{ intakes: Intake[] }>(`${base}/intakes${range}`);
  const events = useApi<{ events: AgendaEvent[] }>(`${base}/events${range}`);
  const history = useApi<{ series: AdherenceDay[]; rate: number | null }>(`${base}/adherence?days=7`);
  const isToday = toDateInput(day) === toDateInput(new Date());

  async function setStatus(i: Intake, status: IntakeStatus) {
    await api.patch(`${base}/intakes/${i._id}`, { status });
    intakes.reload();
    history.reload();
  }

  const list = intakes.data?.intakes ?? [];
  const evs = events.data?.events ?? [];

  return (
    <div className="fade-up">
      <PageHeader title="Suivi des prises et rendez-vous" subtitle={`Ce que ${senior.firstName} a confirmé auprès de l'assistant vocal`} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "prises", label: "Prises", count: list.length },
                { value: "rdv", label: "Rendez-vous", count: evs.length },
              ]}
            />
            <div className="flex items-center gap-1">
              <button className="rounded-lg p-2 text-muted hover:bg-brand-50" onClick={() => setDay(addDays(day, -1))} aria-label="Jour précédent">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-48 text-center text-sm font-bold text-ink">{isToday ? `Aujourd'hui` : fmtDayCap(day)}</span>
              <button className="rounded-lg p-2 text-muted hover:bg-brand-50 disabled:opacity-30" onClick={() => setDay(addDays(day, 1))} aria-label="Jour suivant" disabled={isToday}>
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {(tab === "prises" ? intakes.loading && !intakes.data : events.loading && !events.data) ? (
            <Spinner />
          ) : tab === "prises" ? (
            list.length === 0 ? (
              <EmptyState icon={<Pill className="h-6 w-6" />} title="Aucune prise ce jour-là" />
            ) : (
              <ul className="divide-y divide-line">
                {list.map((i) => (
                  <li key={i._id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className="w-14 text-lg font-extrabold text-ink">{fmtTime(i.scheduledAt)}</span>
                    <IconBubble tone={i.status === "manque" ? "danger" : i.status === "confirme" ? "ok" : "brand"} size="sm">
                      <Pill className="h-4 w-4" />
                    </IconBubble>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">
                        {i.medication?.name ?? "Traitement supprimé"} {i.medication?.dosage}
                      </p>
                      <p className="text-xs text-muted">
                        {i.status === "confirme" && i.confirmedAt
                          ? `Confirmée à ${fmtTime(i.confirmedAt)}`
                          : i.reminders
                            ? `${i.reminders} rappel(s) envoyé(s)`
                            : "Rappel vocal programmé"}
                      </p>
                    </div>
                    <IntakeBadge status={i.status} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setStatus(i, "confirme")}
                        disabled={i.status === "confirme"}
                        className="rounded-lg p-2 text-ok-600 hover:bg-ok-50 disabled:opacity-30"
                        aria-label="Marquer comme prise"
                        title="Marquer comme prise"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setStatus(i, "manque")}
                        disabled={i.status === "manque"}
                        className="rounded-lg p-2 text-danger-600 hover:bg-danger-50 disabled:opacity-30"
                        aria-label="Marquer comme manquée"
                        title="Marquer comme manquée"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : evs.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Aucun rendez-vous ce jour-là" />
          ) : (
            <ul className="divide-y divide-line">
              {evs.map((e) => (
                <li key={e._id} className="flex items-center gap-4 px-5 py-4">
                  <span className="w-14 text-lg font-extrabold text-ink">{fmtTime(e.startAt)}</span>
                  <IconBubble size="sm">
                    <CalendarDays className="h-4 w-4" />
                  </IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{e.title}</p>
                    {e.location && (
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <MapPin className="h-3 w-3" /> {e.location}
                      </p>
                    )}
                  </div>
                  <Badge tone={e.status === "fait" ? "ok" : e.status === "annule" ? "muted" : "brand"}>
                    {e.status === "fait" ? "Effectué" : e.status === "annule" ? "Annulé" : "Prévu"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start">
          <CardHeader
            title="Historique des 7 derniers jours"
            action={history.data?.rate != null && <span className="text-2xl font-black text-ok-600">{history.data.rate} %</span>}
          />
          <div className="px-5 pb-5">
            {history.data ? (
              <>
                <DayBars
                  data={history.data.series.map((d) => ({
                    label: new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""),
                    confirmed: d.confirmed,
                    missed: d.missed,
                    total: d.total,
                  }))}
                />
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-ok-500" /> Confirmées
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-danger-500" /> Manquées
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> À venir
                  </span>
                </div>
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
