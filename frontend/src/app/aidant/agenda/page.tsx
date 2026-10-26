"use client";

import { useMemo, useState } from "react";
import { Activity, BellRing, Bot, CalendarDays, ChevronLeft, ChevronRight, MapPin, Mic, Pencil, Pill, Plus, Stethoscope, Trash2, Utensils } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { addDays, endOfDay, fmtShort, fmtTime, startOfDay, toDateInput, toTimeInput } from "@/lib/format";
import type { AgendaEvent, EventType, Intake } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Field, IconBubble, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";
import { IntakeBadge } from "../IntakeBadge";

const TYPES: Record<EventType, { label: string; icon: typeof CalendarDays; tone: "brand" | "warn" | "violet" | "muted" }> = {
  rdv: { label: "Rendez-vous", icon: Stethoscope, tone: "brand" },
  repas: { label: "Repas", icon: Utensils, tone: "warn" },
  activite: { label: "Activité", icon: Activity, tone: "violet" },
  rappel: { label: "Rappel", icon: BellRing, tone: "brand" },
  autre: { label: "Autre", icon: CalendarDays, tone: "muted" },
};

const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export default function AgendaPage() {
  const { senior, base } = useCurrentSenior();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [editing, setEditing] = useState<Partial<AgendaEvent> | null>(null);
  const range = qs({ from: weekStart.toISOString(), to: endOfDay(addDays(weekStart, 6)).toISOString() });
  const events = useApi<{ events: AgendaEvent[] }>(`${base}/events${range}`);
  const intakes = useApi<{ intakes: Intake[] }>(`${base}/intakes${range}`);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayKey = toDateInput(new Date());

  async function remove(e: AgendaEvent) {
    if (!confirm(`Supprimer « ${e.title} » ?`)) return;
    await api.del(`${base}/events/${e._id}`);
    events.reload();
  }

  const loading = (events.loading && !events.data) || (intakes.loading && !intakes.data);

  return (
    <div className="fade-up">
      <PageHeader
        title={`Agenda de ${senior.firstName}`}
        subtitle="Rendez-vous, repas et activités ; les prises de médicaments apparaissent automatiquement"
        action={
          <Button onClick={() => setEditing({ type: "rdv", startAt: new Date(new Date().setHours(10, 0, 0, 0)).toISOString() })}>
            <Plus className="h-4 w-4" /> Nouvel événement
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-line bg-white">
          <button className="rounded-l-xl p-2.5 text-muted hover:bg-brand-50" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-52 px-2 text-center text-sm font-bold text-ink">
            Semaine du {fmtShort(weekStart)} au {fmtShort(addDays(weekStart, 6))}
          </span>
          <button className="rounded-r-xl p-2.5 text-muted hover:bg-brand-50" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
          Aujourd&apos;hui
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const key = toDateInput(day);
            const dayEvents = (events.data?.events ?? []).filter((e) => toDateInput(new Date(e.startAt)) === key);
            const dayIntakes = (intakes.data?.intakes ?? []).filter((i) => toDateInput(new Date(i.scheduledAt)) === key);
            const items = [
              ...dayEvents.map((e) => ({ at: e.startAt, kind: "event" as const, e })),
              ...dayIntakes.map((i) => ({ at: i.scheduledAt, kind: "intake" as const, i })),
            ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
            const isToday = key === todayKey;
            return (
              <Card key={key} className={cx("overflow-hidden", isToday && "ring-2 ring-brand-300")}>
                <div className={cx("flex items-center justify-between px-5 py-3", isToday ? "bg-brand-50" : "bg-canvas/70")}>
                  <p className="font-extrabold capitalize text-ink">
                    {day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {isToday && <Badge className="ml-2">Aujourd&apos;hui</Badge>}
                  </p>
                  <button
                    onClick={() => setEditing({ type: "rdv", startAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10).toISOString() })}
                    className="rounded-lg p-1.5 text-brand-600 hover:bg-white"
                    aria-label="Ajouter un événement ce jour"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">Rien de prévu.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((it) =>
                      it.kind === "event" ? (
                        <EventRow key={it.e._id} e={it.e} onEdit={() => setEditing(it.e)} onDelete={() => remove(it.e)} />
                      ) : (
                        <li key={it.i._id} className="flex items-center gap-4 px-5 py-3">
                          <span className="w-12 text-sm font-extrabold text-ink">{fmtTime(it.i.scheduledAt)}</span>
                          <IconBubble tone="ok" size="sm">
                            <Pill className="h-4 w-4" />
                          </IconBubble>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-ink">Prise de médicament</p>
                            <p className="text-xs text-muted">
                              {it.i.medication?.name} {it.i.medication?.dosage}
                            </p>
                          </div>
                          <IntakeBadge status={it.i.status} />
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && <EventModal base={base} event={editing} onClose={() => setEditing(null)} onSaved={events.reload} />}
    </div>
  );
}

function EventRow({ e, onEdit, onDelete }: { e: AgendaEvent; onEdit: () => void; onDelete: () => void }) {
  const t = TYPES[e.type];
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <span className="w-12 text-sm font-extrabold text-ink">{fmtTime(e.startAt)}</span>
      <IconBubble tone={t.tone} size="sm">
        <t.icon className="h-4 w-4" />
      </IconBubble>
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm font-bold text-ink", e.status === "annule" && "line-through opacity-60")}>{e.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          {e.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {e.location}
            </span>
          )}
          {e.createdBy === "senior" && (
            <span className="inline-flex items-center gap-1 text-brand-600">
              <Mic className="h-3 w-3" /> Créé à la voix
            </span>
          )}
          {e.createdBy === "ia" && (
            <span className="inline-flex items-center gap-1 text-violet-500">
              <Bot className="h-3 w-3" /> Proposé par l&apos;IA
            </span>
          )}
        </p>
      </div>
      <Badge tone={t.tone}>{t.label}</Badge>
      <button onClick={onEdit} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`Modifier ${e.title}`}>
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={onDelete} className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600" aria-label={`Supprimer ${e.title}`}>
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function EventModal({ base, event, onClose, onSaved }: { base: string; event: Partial<AgendaEvent>; onClose: () => void; onSaved: () => void }) {
  const start = event.startAt ? new Date(event.startAt) : new Date();
  const [form, setForm] = useState({
    title: event.title ?? "",
    type: event.type ?? "rdv",
    date: toDateInput(start),
    time: toTimeInput(start),
    location: event.location ?? "",
    notes: event.notes ?? "",
    status: event.status ?? "prevu",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { date, time, ...rest } = form;
      const payload = { ...rest, startAt: new Date(`${date}T${time}`).toISOString() };
      if (event._id) await api.put(`${base}/events/${event._id}`, payload);
      else await api.post(`${base}/events`, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event._id ? "Modifier l'événement" : "Nouvel événement"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} loading={saving}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Titre">{(id) => <Input id={id} placeholder="Consultation cardiologique" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            {(id) => (
              <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}>
                {Object.entries(TYPES).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">{(id) => <Input id={id} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
          <Field label="Heure">{(id) => <Input id={id} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />}</Field>
        </div>
        <Field label="Lieu">{(id) => <Input id={id} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />}</Field>
        <Field label="Notes">{(id) => <Textarea id={id} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        {event._id && (
          <Field label="Statut">
            {(id) => (
              <Select id={id} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AgendaEvent["status"] })}>
                <option value="prevu">Prévu</option>
                <option value="fait">Fait</option>
                <option value="annule">Annulé</option>
              </Select>
            )}
          </Field>
        )}
        <ErrorBox>{error}</ErrorBox>
      </div>
    </Modal>
  );
}
