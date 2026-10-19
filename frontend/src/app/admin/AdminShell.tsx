"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Cpu, FileBarChart, LayoutDashboard, LineChart, Search, Settings, Users } from "lucide-react";
import { AppShell, RequireRole, type NavItem } from "@/components/AppShell";
import { api, qs } from "@/lib/api";
import type { User } from "@/lib/types";
import { Avatar, cx } from "@/components/ui";
import { PeriodProvider } from "./shared";
import type { Insight } from "./types";

const NAV: NavItem[] = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/analytique", label: "Analytique & tendances", icon: LineChart },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/services-ia", label: "Services IA", icon: Cpu },
  { href: "/admin/journaux", label: "Journaux & rapports", icon: FileBarChart },
  { href: "/admin/configuration", label: "Configuration", icon: Settings },
];

// Entrées de la recherche globale (rubriques et fonctionnalités)
const SEARCH_INDEX: { label: string; hint: string; href: string; keywords: string }[] = [
  ...NAV.map((n) => ({ label: n.label, hint: "Rubrique", href: n.href, keywords: n.label })),
  { label: "Insights & recommandations", hint: "Tableau de bord", href: "/admin#insights", keywords: "insight recommandation amélioration" },
  { label: "Entonnoir des actions vocales", hint: "Analytique", href: "/admin/analytique#entonnoir", keywords: "entonnoir abandon parcours voix" },
  { label: "Carte thermique d'activité", hint: "Analytique", href: "/admin/analytique#heures", keywords: "heure jour pic sollicitation" },
  { label: "Latence P50 / P95", hint: "Services IA", href: "/admin/services-ia", keywords: "latence temps réponse p95 performance" },
  { label: "Quotas des fournisseurs", hint: "Services IA", href: "/admin/services-ia#quotas", keywords: "quota consommation groq gemini" },
  { label: "Exporter les statistiques (CSV)", hint: "Journaux & rapports", href: "/admin/journaux#rapports", keywords: "export csv rapport télécharger" },
  { label: "Fournisseurs principaux et de secours", hint: "Configuration", href: "/admin/configuration#fournisseurs", keywords: "fournisseur secours bascule panne" },
  { label: "Seuils d'alerte", hint: "Configuration", href: "/admin/configuration#seuils", keywords: "seuil objectif alerte" },
  { label: "Confidentialité et conservation", hint: "Configuration", href: "/admin/configuration#confidentialite", keywords: "confidentialité rgpd anonymisation conservation" },
  { label: "Comptes et rôles", hint: "Configuration", href: "/admin/configuration#comptes", keywords: "compte rôle utilisateur administrateur aidant" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <PeriodProvider>
        <AppShell
          nav={NAV}
          spaceLabel="Administration"
          home="/admin"
          wide
          headerStart={<GlobalSearch />}
          headerEnd={<ActionsBell />}
          sidebarFooter={false}
        >
          {children}
        </AppShell>
      </PeriodProvider>
    </RequireRole>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Raccourci clavier Ctrl+K / ⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      api
        .get<{ users: User[] }>(`/admin/users${qs({ q: q.trim() })}`)
        .then((r) => setUsers(r.users.slice(0, 4)))
        .catch(() => setUsers([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const term = q.trim().toLowerCase();
  const pages = term ? SEARCH_INDEX.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(term)).slice(0, 6) : SEARCH_INDEX.slice(0, 6);
  const shownUsers = term.length >= 2 ? users : [];

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <div className="relative max-w-xl">
      <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 shadow-card focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const first = pages[0]?.href ?? (shownUsers[0] && "/admin/configuration#comptes");
              if (first) go(first);
            }
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder="Rechercher un utilisateur, une fonctionnalité, un service…"
          aria-label="Recherche globale"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[11px] font-bold text-muted sm:block">Ctrl K</kbd>
      </label>
      {open && (pages.length > 0 || shownUsers.length > 0) && (
        <div className="absolute left-0 right-0 top-12 z-40 rounded-xl border border-line bg-white p-1.5 shadow-pop">
          {pages.map((p) => (
            <button key={p.href + p.label} onMouseDown={() => go(p.href)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50">
              <span className="font-semibold text-ink">{p.label}</span>
              <span className="text-xs text-muted">{p.hint}</span>
            </button>
          ))}
          {shownUsers.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">Comptes</p>}
          {shownUsers.map((u) => (
            <button key={u._id} onMouseDown={() => go("/admin/configuration#comptes")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50">
              <Avatar name={u.name} size="sm" tone={u.role === "admin" ? "violet" : "brand"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{u.name}</span>
                <span className="block truncate text-xs text-muted">{u.email}</span>
              </span>
              <span className="text-xs text-muted">{u.role === "admin" ? "Administrateur" : "Aidant"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Nombre de points nécessitant une action (insights critiques)
function ActionsBell() {
  const [items, setItems] = useState<Insight[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api
      .get<{ insights: Insight[] }>("/admin/insights?days=7")
      .then((r) => setItems(r.insights.filter((i) => i.severity === "critique" || i.severity === "attention")))
      .catch(() => {});
  }, []);
  const critical = items.filter((i) => i.severity === "critique").length;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-xl p-2.5 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`${items.length} point(s) nécessitant une action`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {items.length > 0 && (
          <span className={cx("absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", critical ? "bg-danger-500" : "bg-warn-500")}>
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-line bg-white p-2 shadow-pop">
            <p className="px-2 py-1 text-xs font-extrabold uppercase tracking-wide text-muted">Actions requises (7 jours)</p>
            {items.length === 0 && <p className="px-2 py-3 text-sm text-muted">Aucun point bloquant.</p>}
            {items.slice(0, 5).map((i) => (
              <Link key={i.id} href="/admin#insights" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 hover:bg-brand-50">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", i.severity === "critique" ? "bg-danger-500" : "bg-warn-500")} />
                  {i.title}
                </p>
                <p className="line-clamp-2 pl-4 text-xs text-muted">{i.observation}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
