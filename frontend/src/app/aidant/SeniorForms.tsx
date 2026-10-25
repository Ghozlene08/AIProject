"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, HeartHandshake, ScanFace, Trash2, User, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { Senior } from "@/lib/types";
import { Button, Card, ErrorBox, Field, Input, Modal, Textarea } from "@/components/ui";
import { useSenior } from "./SeniorContext";

/* ------------------------------------------------------------------ */
/* Photo constraints                                                   */
/* ------------------------------------------------------------------ */

// URL publique de l'API (sans /api) pour afficher les images servies par le backend
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/api\/?$/, "").replace(/\/$/, "");
export const assetUrl = (path?: string) => (!path ? "" : /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path}`);

const MAX_PHOTO_MB = 2;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/* ------------------------------------------------------------------ */
/* Form state                                                          */
/* ------------------------------------------------------------------ */

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
  // Photo
  photoFile: File | null; // newly chosen file
  photoUrl: string; // existing photo already stored on the server
  removePhoto: boolean; // user asked to delete the existing photo
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
  photoFile: null,
  photoUrl: s?.photoUrl ?? "",
  removePhoto: false,
});

/** Sends multipart/form-data so the image and the fields travel in one request. */
const toFormData = (f: FormState) => {
  const fd = new FormData();
  fd.append("firstName", f.firstName);
  fd.append("lastName", f.lastName);
  if (f.birthDate) fd.append("birthDate", f.birthDate);
  fd.append("phone", f.phone);
  fd.append("address", f.address);
  fd.append("city", f.city);
  // multipart can't nest objects: send the doctor as JSON and parse it on the server
  fd.append("doctor", JSON.stringify({ name: f.doctorName, specialty: f.doctorSpecialty, phone: f.doctorPhone }));
  fd.append("medicalNotes", f.medicalNotes);
  if (f.photoFile) fd.append("photo", f.photoFile);
  if (f.removePhoto && !f.photoFile) fd.append("removePhoto", "true");
  return fd;
};

/* ------------------------------------------------------------------ */
/* Photo field                                                         */
/* ------------------------------------------------------------------ */

function PhotoField({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  // Local preview of the chosen file (revoked on change/unmount to avoid leaks)
  const preview = useMemo(() => (form.photoFile ? URL.createObjectURL(form.photoFile) : ""), [form.photoFile]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const shown = preview || (form.removePhoto ? "" : assetUrl(form.photoUrl));

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allows re-selecting the same file later
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Format non pris en charge. Utilisez une image JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`L'image est trop lourde (maximum ${MAX_PHOTO_MB} Mo).`);
      return;
    }
    setError("");
    setForm({ ...form, photoFile: file, removePhoto: false });
  }

  function onRemove() {
    setError("");
    setForm({ ...form, photoFile: null, removePhoto: !!form.photoUrl });
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-brand-50 text-brand-400">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Photo du proche" className="h-full w-full object-cover" />
        ) : (
          <User className="h-10 w-10" aria-hidden />
        )}
      </div>

      <div className="text-center sm:text-left">
        <p className="text-sm font-bold text-brand-900">Photo de profil</p>
        <p className="text-xs text-muted">JPG, PNG ou WebP, {MAX_PHOTO_MB} Mo maximum.</p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={onPick}
            className="sr-only"
            aria-label="Choisir une photo de profil"
          />
          <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()}>
            <Camera className="h-4 w-4" /> {shown ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {shown && (
            <Button type="button" variant="ghost" onClick={onRemove}>
              <Trash2 className="h-4 w-4" /> Retirer
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

function SeniorFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <PhotoField form={form} setForm={setForm} />
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

// Après la création : le senior se connecte uniquement par reconnaissance faciale
export function FaceSetupResult({ senior }: { senior: Senior }) {
  const ready = Boolean(senior.photoUrl);
  return (
    <div className={`rounded-2xl p-5 text-center ${ready ? "bg-ok-50" : "bg-warn-50"}`}>
      {ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(senior.photoUrl)} alt={`Visage de ${senior.firstName}`} className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-white" />
      ) : (
        <ScanFace className="mx-auto h-10 w-10 text-warn-600" />
      )}
      <p className={`mt-3 flex items-center justify-center gap-2 font-bold ${ready ? "text-ok-600" : "text-warn-600"}`}>
        {ready && <CheckCircle2 className="h-5 w-5" />}
        {ready ? "Reconnaissance faciale activée" : "Reconnaissance faciale à activer"}
      </p>
      <p className="mt-1 text-sm text-ink">
        {ready
          ? `${senior.firstName} pourra se connecter simplement en regardant la caméra, sans code ni mot de passe.`
          : `Ajoutez une photo du visage de ${senior.firstName} (bouton « Modifier » du profil) pour lui permettre de se connecter.`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create flow                                                         */
/* ------------------------------------------------------------------ */

function useCreateSenior(onDone?: () => void) {
  const { reload, select } = useSenior();
  const [form, setForm] = useState<FormState>(toForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ senior: Senior } | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api.post<{ senior: Senior }>("/aidant/seniors", toFormData(form));
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
            <FaceSetupResult senior={c.result.senior} />
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
        <FaceSetupResult senior={c.result.senior} />
      ) : (
        <div className="space-y-4">
          <SeniorFields form={c.form} setForm={c.setForm} />
          <ErrorBox>{c.error}</ErrorBox>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Edit flow                                                           */
/* ------------------------------------------------------------------ */

export function EditSeniorModal({ open, onClose, senior, onSaved }: { open: boolean; onClose: () => void; senior: Senior; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(senior));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.put(`/aidant/seniors/${senior._id}`, toFormData(form));
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