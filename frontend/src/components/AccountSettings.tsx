"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, KeyRound, Send, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Button, Card, CardHeader, ErrorBox, Field, Input, Toggle } from "./ui";

type TelegramStatus = { configured: boolean; bot: string | null; linked: boolean };

// Telegram : liaison en un clic par le robot (plus d'identifiant à copier à la main)
function TelegramLink() {
  const [st, setSt] = useState<TelegramStatus | null>(null);
  const [waiting, setWaiting] = useState<{ url: string; qr: string; code: string; bot: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const poll = useRef<number | null>(null);

  const refresh = () => api.get<TelegramStatus>("/aidant/telegram").then((s) => (setSt(s), s));

  useEffect(() => {
    refresh().catch(() => setSt({ configured: false, bot: null, linked: false }));
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, []);

  async function connect() {
    setNote(null);
    setBusy("link");
    try {
      // QR code (téléphone), lien vers l'application ou Telegram Web, ou code à envoyer au robot :
      // fonctionne même si Telegram n'est pas installé sur l'ordinateur
      setWaiting(await api.post<{ url: string; qr: string; code: string; bot: string }>("/aidant/telegram/link"));
      if (poll.current) window.clearInterval(poll.current);
      const until = Date.now() + 15 * 60000;
      poll.current = window.setInterval(async () => {
        const s = await refresh().catch(() => null);
        if (s?.linked || Date.now() > until) {
          window.clearInterval(poll.current!);
          setWaiting(null);
          setNote(s?.linked ? { ok: true, text: "Telegram est connecté : un message de bienvenue vous a été envoyé." } : { ok: false, text: "Le code a expiré. Cliquez de nouveau sur « Connecter Telegram »." });
        }
      }, 3000);
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function action(kind: "test" | "unlink") {
    setNote(null);
    setBusy(kind);
    try {
      let previews = 0;
      if (kind === "test") previews = (await api.post<{ previews: number }>("/aidant/telegram/test")).previews;
      else await api.del("/aidant/telegram");
      await refresh();
      setNote({
        ok: true,
        text: kind === "unlink" ? "Telegram est déconnecté." : previews ? "Message de test et aperçu du résumé du soir envoyés sur Telegram." : "Message de test envoyé sur Telegram.",
      });
    } catch (err) {
      setNote({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-bold text-ink">
            Telegram
            {st?.linked && (
              <span className="flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-xs font-bold text-ok-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connecté
              </span>
            )}
          </p>
          <p className="text-sm text-muted">Alerte immédiate (SOS, prise manquée, rendez-vous médical) et résumé du soir</p>
        </div>
        {st && !st.configured && <p className="text-sm font-semibold text-muted">Non disponible sur ce serveur</p>}
        {st?.configured && !st.linked && !waiting && (
          <Button onClick={connect} loading={busy === "link"}>
            <Send className="h-4 w-4" /> Connecter Telegram
          </Button>
        )}
        {st?.linked && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => action("test")} loading={busy === "test"}>
              Envoyer un test
            </Button>
            <Button variant="ghost" onClick={() => action("unlink")} loading={busy === "unlink"}>
              Déconnecter
            </Button>
          </div>
        )}
      </div>
      {waiting && (
        <div className="mt-4 rounded-xl border border-brand-100 bg-white p-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={waiting.qr} alt="QR code pour relier Telegram" className="h-40 w-40 shrink-0 rounded-lg border border-line" />
            <ol className="min-w-0 space-y-2 text-sm text-ink">
              <li>
                <strong>Avec votre téléphone :</strong> scannez ce QR code avec l&apos;appareil photo, puis appuyez sur « Démarrer » dans Telegram.
              </li>
              <li>
                <strong>Sur cet ordinateur :</strong>{" "}
                <a href={waiting.url} target="_blank" rel="noreferrer" className="font-bold text-brand-600 underline">
                  ouvrir l&apos;application Telegram
                </a>{" "}
                ou{" "}
                <a href={`https://web.telegram.org/k/#@${waiting.bot}`} target="_blank" rel="noreferrer" className="font-bold text-brand-600 underline">
                  Telegram Web
                </a>
                .
              </li>
              <li>
                <strong>Sinon :</strong> envoyez ce code à <span className="font-semibold">@{waiting.bot}</span> :{" "}
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(waiting.code)}
                  title="Copier le code"
                  className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-base font-black tracking-widest text-brand-800 hover:bg-brand-100"
                >
                  {waiting.code}
                </button>
              </li>
            </ol>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> En attente de Telegram… cette page se mettra à jour toute seule.
          </p>
        </div>
      )}
      {note && <p className={`mt-3 text-sm font-bold ${note.ok ? "text-ok-600" : "text-danger-600"}`}>{note.text}</p>}
    </div>
  );
}

// Paramètres du compte connecté : profil, notifications (aidant), mot de passe
export function AccountSettings({ withNotifications = true }: { withNotifications?: boolean }) {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name ?? "", phone: user?.phone ?? "" });
  // Telegram se relie par le robot (TelegramLink) : il n'est pas envoyé par ce formulaire
  const [notif, setNotif] = useState({
    email: user?.notifications?.email ?? true,
    sms: user?.notifications?.sms ?? false,
  });
  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState<{ section: string; ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function run(section: string, fn: () => Promise<void>, okText: string) {
    setSaving(section);
    setMsg(null);
    try {
      await fn();
      setMsg({ section, ok: true, text: okText });
    } catch (err) {
      setMsg({ section, ok: false, text: (err as Error).message });
    } finally {
      setSaving(null);
    }
  }

  const saveProfile = () =>
    run(
      "profile",
      async () => {
        const res = await api.put<{ user: User }>("/auth/me", { ...profile, ...(withNotifications ? { notifications: notif } : {}) });
        setUser(res.user);
      },
      "Modifications enregistrées",
    );

  const savePassword = () =>
    run(
      "password",
      async () => {
        await api.put("/auth/password", pwd);
        setPwd({ currentPassword: "", newPassword: "" });
      },
      "Mot de passe modifié",
    );

  const feedback = (section: string) =>
    msg?.section === section ? (
      msg.ok ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-ok-600">
          <CheckCircle2 className="h-4 w-4" /> {msg.text}
        </p>
      ) : (
        <ErrorBox>{msg.text}</ErrorBox>
      )
    ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Mon compte" icon={<UserRound className="h-5 w-5" />} />
        <div className="space-y-4 px-5 pb-5">
          <Field label="Nom complet">{(id) => <Input id={id} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />}</Field>
          <Field label="Adresse e-mail" hint="L'adresse e-mail ne peut pas être modifiée.">
            {(id) => <Input id={id} value={user?.email ?? ""} disabled />}
          </Field>
          <Field label="Téléphone">{(id) => <Input id={id} type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />}</Field>
          <div className="flex items-center justify-between gap-3">
            {feedback("profile")}
            <Button className="ml-auto" onClick={saveProfile} loading={saving === "profile"}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Card>

      {withNotifications && (
        <Card>
          <CardHeader title="Notifications" icon={<Bell className="h-5 w-5" />} subtitle="Comment être prévenu des alertes importantes" />
          <div className="space-y-3 px-5 pb-5">
            <TelegramLink />
            {(
              [
                ["email", "E-mail", "Synthèse hebdomadaire et alertes"],
                ["sms", "SMS", "Uniquement pour les SOS"],
              ] as const
            ).map(([k, label, text]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-canvas p-4">
                <div>
                  <p className="font-bold text-ink">{label}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
                <Toggle label={label} checked={notif[k]} onChange={(v) => setNotif({ ...notif, [k]: v })} />
              </div>
            ))}
            <div className="flex items-center justify-end">
              <Button onClick={saveProfile} loading={saving === "profile"}>
                Enregistrer
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Sécurité" icon={<KeyRound className="h-5 w-5" />} />
        <div className="space-y-4 px-5 pb-5">
          <Field label="Mot de passe actuel">
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />}
          </Field>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />}
          </Field>
          <div className="flex items-center justify-between gap-3">
            {feedback("password")}
            <Button className="ml-auto" variant="outline" onClick={savePassword} loading={saving === "password"}>
              Changer le mot de passe
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
