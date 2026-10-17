"use client";

import { Activity, Cpu, LayoutDashboard, ScrollText, Settings, Users } from "lucide-react";
import { AppShell, RequireRole, type NavItem } from "@/components/AppShell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Supervision IA", icon: LayoutDashboard },
  { href: "/admin/journaux", label: "Journaux des appels", icon: ScrollText },
  { href: "/admin/fournisseurs", label: "Fournisseurs IA", icon: Cpu },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <AppShell
        nav={NAV}
        spaceLabel="Administration"
        home="/admin"
        sidebarExtra={
          <p className="mb-3 flex items-center gap-2 px-3 text-xs font-extrabold uppercase tracking-widest text-violet-500">
            <Activity className="h-3.5 w-3.5" /> Plateforme
          </p>
        }
      >
        {children}
      </AppShell>
    </RequireRole>
  );
}
