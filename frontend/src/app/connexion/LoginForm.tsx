"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, Settings2, UserRound, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { FaceLogin } from "./FaceLogin";
import type { Role } from "@/lib/types";
import { Button, ErrorBox, Field, Input, cx } from "@/components/ui";

type LoginSpace = "aidant" | "senior" | "admin";

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { login, user, loading: authLoading } = useAuth();

  const [space, setSpace] = useState<LoginSpace>(
    params.get("espace") === "admin"
      ? "admin"
      : params.get("espace") === "senior"
        ? "senior"
        : "aidant"
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showFaceLogin, setShowFaceLogin] = useState(false);
  // Déjà connecté : on rejoint directement son espace
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(user.role === "admin" ? "/admin" : "/aidant");
    }
  }, [user, authLoading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // La personne âgée utilisera la reconnaissance faciale
    if (space === "senior") return;

    setError("");
    setLoading(true);

    try {
      const u = await login(email, password, space as Role);
      router.replace(u.role === "admin" ? "/admin" : "/aidant");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }
if (showFaceLogin) {
  return <FaceLogin onBack={() => setShowFaceLogin(false)} />;
}
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">
        Connexion
      </h1>

      <p className="mt-2 text-muted">
        Accédez à votre espace Senior Assistant.
      </p>

      {/* Choix de l'espace */}
      <div
        role="tablist"
        className="mt-7 grid grid-cols-3 gap-2 rounded-2xl bg-brand-50 p-1.5"
      >
        {[
          {
            v: "aidant",
            label: "Espace Aidant",
            icon: Users,
          },
          {
            v: "senior",
            label: "Personne âgée",
            icon: UserRound,
          },
          {
            v: "admin",
            label: "Administration",
            icon: Settings2,
          },
        ].map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={space === v}
            onClick={() => {
              setSpace(v as LoginSpace);
              setError("");
            }}
            className={cx(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
              space === v
                ? "bg-white text-brand-700 shadow-sm"
                : "text-muted hover:text-brand-700"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* PERSONNE ÂGÉE */}
      {space === "senior" ? (
        <div className="mt-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <UserRound className="h-10 w-10 text-brand-600" />
          </div>

          <h2 className="mt-5 text-xl font-extrabold text-brand-900">
            Connectez-vous simplement avec votre visage
          </h2>

          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Aucun e-mail ni mot de passe. Regardez simplement la caméra pour
            accéder à votre espace.
          </p>

          <Button
            type="button"
            size="lg"
            className="mt-7 w-full"
            onClick={() => setShowFaceLogin(true)}
          >
            <Camera className="h-5 w-5" />
            Me connecter avec mon visage
          </Button>
        </div>
      ) : (
        <>
          {/* AIDANT / ADMIN */}
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Adresse e-mail">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                />
              )}
            </Field>

            <Field label="Mot de passe">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              )}
            </Field>

            <ErrorBox>{error}</ErrorBox>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={loading}
            >
              Se connecter
            </Button>
          </form>

          {/* Inscription uniquement pour l'aidant */}
          {space === "aidant" && (
            <p className="mt-6 text-center text-sm text-muted">
              Pas encore de compte ?{" "}
              <Link
                href="/inscription"
                className="font-bold text-brand-600 hover:underline"
              >
                Créer un compte aidant
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}