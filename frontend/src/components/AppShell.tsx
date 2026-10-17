"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Logo } from "./Logo";
import { Avatar, Spinner, cx } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

// Protège un espace : redirige vers la connexion si besoin
export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/connexion?espace=${role}`);
    else if (user.role !== role && !(role === "aidant" && user.role === "admin")) {
      router.replace(user.role === "admin" ? "/admin" : "/aidant");
    }
  }, [user, loading, role, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Vérification de la session…" />
      </div>
    );
  }
  return <>{children}</>;
}

export function AppShell({
  nav,
  spaceLabel,
  home,
  sidebarExtra,
  children,
}: {
  nav: NavItem[];
  spaceLabel: string;
  home: string;
  sidebarExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === home ? pathname === href : pathname.startsWith(href));

  const sidebar = (
    <nav aria-label={`Navigation ${spaceLabel}`} className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 px-2 pt-1">
        <Logo href={home} subtitle={spaceLabel} />
      </div>
      {sidebarExtra}
      {nav.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-brand-50/60 hover:text-brand-700",
            )}
          >
            <Icon className={cx("h-5 w-5", active ? "text-brand-600" : "text-slate-400")} />
            <span className="flex-1">{label}</span>
            {badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1.5 text-[11px] font-bold text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100/70 p-4 text-sm">
        <p className="font-bold text-brand-800">Besoin d&apos;aide ?</p>
        <p className="mt-1 text-xs leading-relaxed text-brand-700/80">Plus d&apos;autonomie, plus de lien, plus de vie.</p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Barre latérale (bureau) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>

      {/* Barre latérale (mobile) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-brand-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop">
            <button className="absolute right-3 top-4 rounded-lg p-2 text-muted" onClick={() => setOpen(false)} aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button className="rounded-lg p-2 text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6" />
          </button>
          <div className="hidden lg:block" />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-brand-50" aria-expanded={open}>
        <Avatar name={user.name} size="sm" tone={user.role === "admin" ? "violet" : "brand"} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-bold text-ink">{user.name}</span>
          <span className="block text-xs text-muted">{user.role === "admin" ? "Administrateur" : "Aidant"}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-pop">
            <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
            <button
              onClick={() => {
                logout();
                router.replace("/");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-danger-600 hover:bg-danger-50"
            >
              <LogOut className="h-4 w-4" /> Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
