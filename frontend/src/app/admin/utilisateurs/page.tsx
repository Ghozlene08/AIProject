"use client";

import { useState } from "react";
import { Pencil, Search, Trash2, UserPlus, Users } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { fmtShort } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { Avatar, Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";

export default function UtilisateursPage() {
  const { user: me } = useAuth();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const { data, loading, reload } = useApi<{ users: User[] }>(`/admin/users${qs({ role, q })}`);

  async function remove(u: User) {
    if (!confirm(`Supprimer définitivement le compte de ${u.name} ?`)) return;
    try {
      await api.del(`/admin/users/${u._id}`);
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const users = data?.users ?? [];

  return (
    <div className="fade-up">
      <PageHeader
        title="Gestion des utilisateurs"
        subtitle="Comptes aidants et administrateurs de la plateforme"
        action={
          <Button onClick={() => setEditing({ role: "aidant", status: "actif" })}>
            <UserPlus className="h-4 w-4" /> Ajouter un utilisateur
          </Button>
        }
      />

      <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-[200px_1fr]">
        <Select aria-label="Rôle" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Tous les rôles</option>
          <option value="aidant">Aidants</option>
          <option value="admin">Administrateurs</option>
        </Select>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Rechercher" placeholder="Nom ou e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </form>
      </Card>

      <Card className="overflow-hidden">
        {loading && !data ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Aucun utilisateur" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Nom</th>
                  <th className="px-5 py-3">E-mail</th>
                  <th className="px-5 py-3">Rôle</th>
                  <th className="px-5 py-3">Seniors</th>
                  <th className="px-5 py-3">Statut</th>
                  <th className="px-5 py-3">Dernière connexion</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u._id}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3 font-bold text-ink">
                        <Avatar name={u.name} size="sm" tone={u.role === "admin" ? "violet" : "brand"} />
                        {u.name}
                        {u._id === me?._id && <Badge tone="muted">Vous</Badge>}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">{u.email}</td>
                    <td className="px-5 py-3">
                      <Badge tone={u.role === "admin" ? "violet" : "brand"}>{u.role === "admin" ? "Administrateur" : "Aidant"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{u.role === "aidant" ? u.seniors : "—"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={u.status === "actif" ? "ok" : "danger"}>{u.status === "actif" ? "Actif" : "Inactif"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{u.lastLoginAt ? fmtShort(u.lastLoginAt) : "Jamais"}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(u)} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`Modifier ${u.name}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(u)}
                          disabled={u._id === me?._id}
                          className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600 disabled:opacity-30"
                          aria-label={`Supprimer ${u.name}`}
                        >
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

      {editing && <UserModal user={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: Partial<User>; onClose: () => void; onSaved: () => void }) {
  const isNew = !user._id;
  const [form, setForm] = useState({
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: (user.role ?? "aidant") as Role,
    status: user.status ?? "actif",
    password: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (isNew) await api.post("/admin/users", form);
      else {
        const { email: _email, password, ...rest } = form;
        void _email;
        await api.put(`/admin/users/${user._id}`, password ? { ...rest, password } : rest);
      }
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
      title={isNew ? "Nouvel utilisateur" : `Modifier ${user.name}`}
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
        <Field label="Nom complet">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Adresse e-mail">{(id) => <Input id={id} type="email" disabled={!isNew} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rôle">
            {(id) => (
              <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="aidant">Aidant</option>
                <option value="admin">Administrateur</option>
              </Select>
            )}
          </Field>
          <Field label="Statut">
            {(id) => (
              <Select id={id} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as User["status"] })}>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label={isNew ? "Mot de passe" : "Nouveau mot de passe (facultatif)"} hint="8 caractères minimum">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <ErrorBox>{error}</ErrorBox>
      </div>
    </Modal>
  );
}
