"use client";

import { useState } from "react";
import { Pencil, Pill, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Intake, Medication, WeeklyStats } from "@/lib/types";
import { Donut } from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Textarea, Toggle } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";

export default function TraitementsPage() {
  const { senior, base } = useCurrentSenior();
  const meds = useApi<{ medications: Medication[]; stats: WeeklyStats }>(`${base}/medications`);
  const today = useApi<{ intakes: Intake[] }>(`${base}/intakes`);
  const [editing, setEditing] = useState<Partial<Medication> | null>(null);

  if (meds.loading && !meds.data) return <Spinner />;
  const list = meds.data?.medications ?? [];
  const intakes = today.data?.intakes ?? [];
  const confirmed = intakes.filter((i) => i.status === "confirme").length;
  const missed = intakes.filter((i) => i.status === "manque").length;
  const pending = intakes.length - confirmed - missed;

  const refresh = () => {
    meds.reload();
    today.reload();
  };

  async function toggle(m: Medication) {
    await api.put(`${base}/medications/${m._id}`, { active: !m.active });
    refresh();
  }

  async function remove(m: Medication) {
    if (!confirm(`Supprimer le traitement « ${m.name} » ? L'historique des prises passées est conservé.`)) return;
    await api.del(`${base}/medications/${m._id}`);
    refresh();
  }

  return (
    <div className="fade-up">
      <PageHeader
        title={`Traitements de ${senior.firstName} ${senior.lastName}`}
        subtitle="Les horaires saisis génèrent automatiquement les rappels de l'interface Senior"
        action={
          <Button onClick={() => setEditing({ times: ["08:00"], active: true })}>
            <Plus className="h-4 w-4" /> Ajouter un traitement
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          {list.length === 0 ? (
            <EmptyState icon={<Pill className="h-6 w-6" />} title="Aucun traitement" text="Ajoutez les médicaments et leurs horaires de prise." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Médicament</th>
                    <th className="px-5 py-3">Posologie</th>
                    <th className="px-5 py-3">Horaires</th>
                    <th className="px-5 py-3">Actif</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((m) => (
                    <tr key={m._id} className={m.active ? "" : "opacity-55"}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-ink">
                          {m.name} {m.dosage}
                        </p>
                        {m.instructions && <p className="text-xs text-muted">{m.instructions}</p>}
                      </td>
                      <td className="px-5 py-4 text-brand-700">{m.posology || "—"}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {m.times.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Toggle label={`Activer ${m.name}`} checked={m.active} onChange={() => toggle(m)} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(m)} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`Modifier ${m.name}`}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove(m)} className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600" aria-label={`Supprimer ${m.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Résumé des prises" subtitle="Aujourd'hui" />
            <div className="flex items-center gap-5 px-5 pb-5">
              <Donut value={intakes.length ? (confirmed / intakes.length) * 100 : 0} size={110} />
              <ul className="flex-1 space-y-2 text-sm">
                <li className="font-bold text-ink">
                  {confirmed} prise{confirmed > 1 ? "s" : ""} sur {intakes.length}
                </li>
                <li className="flex justify-between">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2.5 w-2.5 rounded-full bg-ok-500" /> Confirmées
                  </span>
                  <b>{confirmed}</b>
                </li>
                <li className="flex justify-between">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2.5 w-2.5 rounded-full bg-danger-500" /> Manquées
                  </span>
                  <b>{missed}</b>
                </li>
                <li className="flex justify-between">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-300" /> À venir
                  </span>
                  <b>{pending}</b>
                </li>
              </ul>
            </div>
          </Card>
          {meds.data?.stats && (
            <Card className="p-5">
              <p className="text-sm font-semibold text-muted">Observance sur 7 jours</p>
              <p className="mt-1 text-4xl font-black text-ok-600">{meds.data.stats.adherence} %</p>
              <p className="mt-1 text-sm text-muted">
                {meds.data.stats.intakesConfirmed} confirmées · {meds.data.stats.intakesMissed} manquées
              </p>
            </Card>
          )}
        </div>
      </div>

      {editing && <MedicationModal base={base} med={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function MedicationModal({ base, med, onClose, onSaved }: { base: string; med: Partial<Medication>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: med.name ?? "",
    dosage: med.dosage ?? "",
    posology: med.posology ?? "1 comprimé",
    times: med.times ?? ["08:00"],
    instructions: med.instructions ?? "",
    active: med.active ?? true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setTime = (i: number, v: string) => setForm({ ...form, times: form.times.map((t, j) => (j === i ? v : t)) });

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, times: [...new Set(form.times.filter(Boolean))].sort() };
      if (med._id) await api.put(`${base}/medications/${med._id}`, payload);
      else await api.post(`${base}/medications`, payload);
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
      title={med._id ? "Modifier le traitement" : "Nouveau traitement"}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Médicament">{(id) => <Input id={id} placeholder="Paracétamol" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Dosage">{(id) => <Input id={id} placeholder="1 g" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} />}</Field>
        </div>
        <Field label="Posologie">{(id) => <Input id={id} value={form.posology} onChange={(e) => setForm({ ...form, posology: e.target.value })} />}</Field>
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">Horaires de prise</p>
          <div className="flex flex-wrap gap-2">
            {form.times.map((t, i) => (
              <div key={i} className="flex items-center gap-1 rounded-xl border border-line pr-1">
                <Input type="time" aria-label={`Horaire ${i + 1}`} value={t} onChange={(e) => setTime(i, e.target.value)} className="h-10 w-32 border-0 focus:ring-0" />
                {form.times.length > 1 && (
                  <button type="button" onClick={() => setForm({ ...form, times: form.times.filter((_, j) => j !== i) })} className="rounded-lg p-1.5 text-muted hover:bg-danger-50 hover:text-danger-600" aria-label="Retirer cet horaire">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="h-10" onClick={() => setForm({ ...form, times: [...form.times, "20:00"] })}>
              <Plus className="h-4 w-4" /> Horaire
            </Button>
          </div>
        </div>
        <Field label="Consignes (facultatif)">{(id) => <Textarea id={id} placeholder="Pendant le repas…" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />}</Field>
        <ErrorBox>{error}</ErrorBox>
      </div>
    </Modal>
  );
}
