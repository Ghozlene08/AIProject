"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings2, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button, ErrorBox, Field, Input, cx } from "@/components/ui";

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<Role>(params.get("espace") === "admin" ? "admin" : "aidant");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Déjà connecté : on rejoint directement son espace
  useEffect(() => {
    if (!authLoading && user) router.replace(user.role === "admin" ? "/admin" : "/aidant");
  }, [user, authLoading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password, role);
      router.replace(u.role === "admin" ? "/admin" : "/aidant");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">Connexion</h1>
      <p className="mt-2 text-muted">Accédez à votre espace Senior Assistant.</p>

      <div role="tablist" className="mt-7 grid grid-cols-2 gap-2 rounded-2xl bg-brand-50 p-1.5">
        {(
          [
            { v: "aidant", label: "Espace Aidant", icon: Users },
            { v: "admin", label: "Administration", icon: Settings2 },
          ] as const
        ).map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={role === v}
            onClick={() => {
              setRole(v);
              setError("");
            }}
            className={cx(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
              role === v ? "bg-white text-brand-700 shadow-sm" : "text-muted hover:text-brand-700",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Adresse e-mail">
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" />}
        </Field>
        <Field label="Mot de passe">
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          )}
        </Field>
        <ErrorBox>{error}</ErrorBox>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Se connecter
        </Button>
      </form>

      {role === "aidant" && (
        <p className="mt-6 text-center text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-bold text-brand-600 hover:underline">
            Créer un compte aidant
          </Link>
        </p>
      )}
    </div>
  );
}
