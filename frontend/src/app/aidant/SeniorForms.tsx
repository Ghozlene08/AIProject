"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartHandshake, KeyRound, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { Senior } from "@/lib/types";
import { Button, Card, ErrorBox, Field, Input, Modal, Textarea } from "@/components/ui";
import { useSenior } from "./SeniorContext";

type FormState = {
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  address: string;
  city: string;
  doctorName: string;
  doctorSpecialty: string;
  doctorPhone: string;
  medicalNotes: string;
};

const toForm = (s?: Senior | null): FormState => ({
  firstName: s?.firstName ?? "",
  lastName: s?.lastName ?? "",
  birthDate: s?.birthDate ? s.birthDate.slice(0, 10) : "",
  phone: s?.phone ?? "",
  address: s?.address ?? "",
  city: s?.city ?? "",
  doctorName: s?.doctor?.name ?? "",
  doctorSpecialty: s?.doctor?.specialty ?? "",
  doctorPhone: s?.doctor?.phone ?? "",
  medicalNotes: s?.medicalNotes ?? "",
});

const toPayload = (f: FormState) => ({
  firstName: f.firstName,
  lastName: f.lastName,
  birthDate: f.birthDate || undefined,
  phone: f.phone,
  address: f.address,
  city: f.city,
  doctor: { name: f.doctorName, specialty: f.doctorSpecialty, phone: f.doctorPhone },
  medicalNotes: f.medicalNotes,
});

function SeniorFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom">{(id) => <Input id={id} required value={form.firstName} onChange={set("firstName")} />}</Field>
        <Field label="Nom">{(id) => <Input id={id} required value={form.lastName} onChange={set("lastName")} />}</Field>
        <Field label="Date de naissance">{(id) => <Input id={id} type="date" value={form.birthDate} onChange={set("birthDate")} />}</Field>
        <Field label="Téléphone">{(id) => <Input id={id} type="tel" value={form.phone} onChange={set("phone")} />}</Field>
        <Field label="Adresse">{(id) => <Input id={id} value={form.address} onChange={set("address")} />}</Field>
        <Field label="Ville">{(id) => <Input id={id} value={form.city} onChange={set("city")} />}</Field>
      </div>
      <p className="pt-2 text-sm font-extrabold uppercase tracking-wide text-brand-600">Médecin traitant</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nom">{(id) => <Input id={id} value={form.doctorName} onChange={set("doctorName")} placeholder="Dr. …" />}</Field>
        <Field label="Spécialité">{(id) => <Input id={id} value={form.doctorSpecialty} onChange={set("doctorSpecialty")} />}</Field>
        <Field label="Téléphone">{(id) => <Input id={id} type="tel" value={form.doctorPhone} onChange={set("doctorPhone")} />}</Field>
      </div>
      <Field label="Notes médicales" hint="Allergies, pathologies… (visibles uniquement par les aidants)">
        {(id) => <Textarea id={id} value={form.medicalNotes} onChange={set("medicalNotes")} />}
      </Field>
    </div>
  );
}

export function PairingResult({ code, pin }: { code?: string; pin: string }) {
  return (
    <div className="rounded-2xl bg-brand-50 p-5 text-center">
      <KeyRound className="mx-auto h-8 w-8 text-brand-600" />
      <p className="mt-3 text-sm text-muted">Communiquez ces codes à votre proche pour appairer son appareil :</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs font-bold uppercase text-muted">Code d&apos;appairage</p>
          <p className="mt-1 font-mono text-2xl font-black tracking-widest text-brand-900">{code}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs font-bold uppercase text-muted">Code PIN</p>
          <p className="mt-1 font-mono text-2xl font-black tracking-widest text-brand-900">{pin}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Le PIN ne sera plus affiché : notez-le maintenant.</p>
      <Link href="/senior/connexion" className="mt-5 flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-brand-700 px-5 text-[22px] font-bold text-white hover:bg-brand-800"><KeyRound className="h-6 w-6" aria-hidden="true" />Connecter le senior</Link>
      <p className="mt-3 text-base text-ink">Sur l’appareil du senior, ouvrez l’Espace Senior et saisissez ces deux codes.</p>
    </div>
  );
}

function useCreateSenior(onDone?: () => void) {
  const { reload, select } = useSenior();
  const [form, setForm] = useState<FormState>(toForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ senior: Senior; pin: string } | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.post<{ senior: Senior; pin: string }>("/aidant/seniors", toPayload(form));
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (result) {
      select(result.senior._id);
      await reload();
    }
    setResult(null);
    setForm(toForm());
    onDone?.();
  }

  return { form, setForm, error, saving, result, submit, finish };
}

export function Onboarding() {
  const c = useCreateSenior();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <HeartHandshake className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-brand-900">Bienvenue dans votre espace aidant</h1>
        <p className="mt-2 text-lg text-muted">Commencez par créer le profil de la personne que vous accompagnez.</p>
      </div>
      <Card className="p-6 sm:p-8">
        {c.result ? (
          <div className="space-y-5">
            <PairingResult code={c.result.senior.pairingCode} pin={c.result.pin} />
            <Button className="w-full" size="lg" onClick={c.finish}>
              Accéder au tableau de bord
            </Button>
          </div>
        ) : (
          <form onSubmit={c.submit} className="space-y-5">
            <SeniorFields form={c.form} setForm={c.setForm} />
            <ErrorBox>{c.error}</ErrorBox>
            <Button type="submit" size="lg" className="w-full" loading={c.saving}>
              <UserPlus className="h-5 w-5" /> Créer le profil
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export function CreateSeniorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCreateSenior(onClose);
  return (
    <Modal
      open={open}
      onClose={c.result ? c.finish : onClose}
      title={c.result ? "Profil créé" : "Ajouter un proche"}
      wide
      footer={
        c.result ? (
          <Button onClick={c.finish}>Terminer</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={() => c.submit()} loading={c.saving}>
              Créer le profil
            </Button>
          </>
        )
      }
    >
      {c.result ? (
        <PairingResult code={c.result.senior.pairingCode} pin={c.result.pin} />
      ) : (
        <div className="space-y-4">
          <SeniorFields form={c.form} setForm={c.setForm} />
          <ErrorBox>{c.error}</ErrorBox>
        </div>
      )}
    </Modal>
  );
}

export function EditSeniorModal({ open, onClose, senior, onSaved }: { open: boolean; onClose: () => void; senior: Senior; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(senior));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.put(`/aidant/seniors/${senior._id}`, toPayload(form));
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifier le profil"
      wide
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
        <SeniorFields form={form} setForm={setForm} />
        <ErrorBox>{error}</ErrorBox>
      </div>
    </Modal>
  );
}
