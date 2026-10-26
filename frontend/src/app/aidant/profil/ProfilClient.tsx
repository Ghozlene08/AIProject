"use client";

import { useState } from "react";
import { KeyRound, Pencil, Phone, Plus, ShieldAlert, Stethoscope, Trash2, UserRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Contact, Senior } from "@/lib/types";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Toggle } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";
import { EditSeniorModal, PairingResult } from "../SeniorForms";

export default function ProfilPage() {
  const { senior, base, reload: reloadSeniors } = useCurrentSenior();
  const { data, loading, reload } = useApi<{ senior: Senior; contacts: Contact[] }>(base);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Partial<Contact> | null>(null);
  const [pairing, setPairing] = useState<{ code?: string; pin: string } | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  if (loading && !data) return <Spinner />;
  const s = data?.senior ?? senior;
  const contacts = data?.contacts ?? [];

  async function regenerate() {
    if (!confirm("Générer un nouveau code ? L'appareil actuellement appairé devra être reconnecté.")) return;
    setPairingLoading(true);
    try {
      const res = await api.post<{ senior: Senior; pin: string }>(`${base}/pairing`);
      setPairing({ code: res.senior.pairingCode, pin: res.pin });
      reload();
    } finally {
      setPairingLoading(false);
    }
  }

  async function removeContact(c: Contact) {
    if (!confirm(`Supprimer le contact ${c.name} ?`)) return;
    await api.del(`${base}/contacts/${c._id}`);
    reload();
  }

  const info: [string, string | undefined][] = [
    ["Nom", `${s.firstName} ${s.lastName}`],
    ["Âge", s.age ? `${s.age} ans` : undefined],
    ["Date de naissance", s.birthDate ? new Date(s.birthDate).toLocaleDateString("fr-FR") : undefined],
    ["Téléphone", s.phone],
    ["Adresse", [s.address, s.city].filter(Boolean).join(", ")],
  ];

  return (
    <div className="fade-up">
      <PageHeader
        title={`Profil de ${s.firstName} ${s.lastName}`}
        subtitle="Informations personnelles, contacts et appairage de l'appareil"
        action={
          <Button onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Modifier
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Informations personnelles" icon={<UserRound className="h-5 w-5" />} />
            <div className="flex flex-wrap gap-6 px-5 pb-5">
              <Avatar name={`${s.firstName} ${s.lastName}`} size="xl" />
              <dl className="grid flex-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {info.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-bold uppercase tracking-wide text-muted">{k}</dt>
                    <dd className="font-semibold text-ink">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Santé" icon={<Stethoscope className="h-5 w-5" />} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div className="rounded-xl bg-canvas p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Médecin traitant</p>
                <p className="mt-1 font-bold text-ink">{s.doctor?.name || "Non renseigné"}</p>
                <p className="text-sm text-muted">{[s.doctor?.specialty, s.doctor?.phone].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="rounded-xl bg-canvas p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Notes médicales</p>
                <p className="mt-1 text-sm text-ink">{s.medicalNotes || "Aucune note"}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Appairage de l'appareil" icon={<KeyRound className="h-5 w-5" />} subtitle="Connexion de l'interface Senior par code + PIN" />
            <div className="flex flex-wrap items-center gap-4 px-5 pb-5">
              <div className="rounded-xl bg-brand-50 px-5 py-3">
                <p className="text-xs font-bold uppercase text-muted">Code d&apos;appairage</p>
                <p className="font-mono text-2xl font-black tracking-widest text-brand-900">{s.pairingCode ?? "—"}</p>
              </div>
              <div className="flex-1">
                {s.pairedAt ? (
                  <Badge tone="ok">Appairé le {new Date(s.pairedAt).toLocaleDateString("fr-FR")}</Badge>
                ) : (
                  <Badge tone="warn">En attente d&apos;appairage</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={regenerate} loading={pairingLoading}>
                Nouveau code
              </Button>
            </div>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader
            title="Contacts d'urgence et proches"
            icon={<Users className="h-5 w-5" />}
            action={
              <Button size="sm" variant="secondary" onClick={() => setContact({ isEmergency: false })}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            }
          />
          {contacts.length === 0 ? (
            <EmptyState icon={<Phone className="h-6 w-6" />} title="Aucun contact" text="Ajoutez les proches que le senior pourra appeler à la voix." />
          ) : (
            <ul className="divide-y divide-line px-5 pb-3">
              {contacts.map((c) => (
                <li key={c._id} className="flex items-center gap-3 py-3">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      {c.name}
                      {c.isEmergency && (
                        <Badge tone="danger">
                          <ShieldAlert className="h-3 w-3" /> SOS
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {c.relation} · {c.phone}
                    </p>
                  </div>
                  <button onClick={() => setContact(c)} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`Modifier ${c.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeContact(c)} className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600" aria-label={`Supprimer ${c.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && (
        <EditSeniorModal
          open
          senior={s}
          onClose={() => setEditing(false)}
          onSaved={() => {
            reload();
            reloadSeniors();
          }}
        />
      )}
      {contact && <ContactModal base={base} contact={contact} onClose={() => setContact(null)} onSaved={reload} />}
      <Modal open={Boolean(pairing)} onClose={() => setPairing(null)} title="Nouveau code d'appairage" footer={<Button onClick={() => setPairing(null)}>J&apos;ai noté les codes</Button>}>
        {pairing && <PairingResult code={pairing.code} pin={pairing.pin} />}
      </Modal>
    </div>
  );
}

function ContactModal({ base, contact, onClose, onSaved }: { base: string; contact: Partial<Contact>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: contact.name ?? "",
    relation: contact.relation ?? "",
    phone: contact.phone ?? "",
    isEmergency: contact.isEmergency ?? false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (contact._id) await api.put(`${base}/contacts/${contact._id}`, form);
      else await api.post(`${base}/contacts`, form);
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
      title={contact._id ? "Modifier le contact" : "Nouveau contact"}
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
        <Field label="Nom">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lien">{(id) => <Input id={id} placeholder="Fille, voisin, médecin…" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />}</Field>
          <Field label="Téléphone">{(id) => <Input id={id} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-canvas p-4">
          <div>
            <p className="font-bold text-ink">Contact d&apos;urgence</p>
            <p className="text-sm text-muted">Prévenu automatiquement en cas de SOS</p>
          </div>
          <Toggle label="Contact d'urgence" checked={form.isEmergency} onChange={(v) => setForm({ ...form, isEmergency: v })} />
        </div>
        <ErrorBox>{error}</ErrorBox>
      </div>
    </Modal>
  );
}
