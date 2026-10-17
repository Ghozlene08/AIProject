"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, ErrorBox, Field, Input } from "@/components/ui";

export default function InscriptionPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Les deux mots de passe ne correspondent pas");
    setError("");
    setLoading(true);
    try {
      await register({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      router.replace("/aidant");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">Créer un compte aidant</h1>
      <p className="mt-2 text-muted">Vous pourrez ensuite créer le profil de votre proche et l&apos;appairer.</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <Field label="Nom complet">{(id) => <Input id={id} required value={form.name} onChange={set("name")} autoComplete="name" />}</Field>
        <Field label="Adresse e-mail">
          {(id) => <Input id={id} type="email" required value={form.email} onChange={set("email")} autoComplete="email" />}
        </Field>
        <Field label="Téléphone (facultatif)">{(id) => <Input id={id} type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mot de passe" hint="8 caractères minimum">
            {(id) => <Input id={id} type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" />}
          </Field>
          <Field label="Confirmation">
            {(id) => <Input id={id} type="password" required value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />}
          </Field>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Créer mon compte
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Déjà inscrit ?{" "}
        <Link href="/connexion?espace=aidant" className="font-bold text-brand-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthLayout>
  );
}
