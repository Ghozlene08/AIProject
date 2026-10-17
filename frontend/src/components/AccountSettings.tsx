"use client";

import { useState } from "react";
import { Bell, CheckCircle2, KeyRound, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Button, Card, CardHeader, ErrorBox, Field, Input, Toggle } from "./ui";

// Paramètres du compte connecté : profil, notifications (aidant), mot de passe
export function AccountSettings({ withNotifications = true }: { withNotifications?: boolean }) {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name ?? "", phone: user?.phone ?? "" });
  const [notif, setNotif] = useState({
    email: user?.notifications?.email ?? true,
    telegram: user?.notifications?.telegram ?? false,
    telegramChatId: user?.notifications?.telegramChatId ?? "",
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
            {(
              [
                ["email", "E-mail", "Synthèse hebdomadaire et alertes"],
                ["telegram", "Telegram", "Alerte immédiate (prise manquée, SOS)"],
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
            {notif.telegram && (
              <Field label="Identifiant de discussion Telegram (chat ID)" hint="Envoyez /start à votre bot puis récupérez votre chat ID (ex. via @userinfobot).">
                {(id) => <Input id={id} value={notif.telegramChatId} onChange={(e) => setNotif({ ...notif, telegramChatId: e.target.value })} placeholder="123456789" />}
              </Field>
            )}
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
