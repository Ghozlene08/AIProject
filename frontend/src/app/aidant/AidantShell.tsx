"use client";

import { useState } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Pill,
  Plus,
  Settings,
  UserRound,
} from "lucide-react";
import { AppShell, RequireRole, type NavItem } from "@/components/AppShell";
import { Avatar, Select, Spinner } from "@/components/ui";
import { SeniorProvider, useSenior } from "./SeniorContext";
import { CreateSeniorModal, Onboarding } from "./SeniorForms";

export function AidantShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="aidant">
      <SeniorProvider>
        <Inner>{children}</Inner>
      </SeniorProvider>
    </RequireRole>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { senior, seniors, select, loading, unread } = useSenior();
  const [creating, setCreating] = useState(false);

  const nav: NavItem[] = [
    { href: "/aidant", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/aidant/profil", label: "Profil du senior", icon: UserRound },
    { href: "/aidant/traitements", label: "Traitements", icon: Pill },
    { href: "/aidant/agenda", label: "Agenda", icon: CalendarDays },
    { href: "/aidant/suivi", label: "Suivi des prises", icon: ClipboardCheck },
    { href: "/aidant/alertes", label: "Alertes", icon: Bell, badge: unread },
    { href: "/aidant/synthese", label: "Synthèse hebdo", icon: FileText },
    { href: "/aidant/parametres", label: "Paramètres", icon: Settings },
  ];

  const selector = senior && (
    <div className="mb-4 rounded-2xl border border-line bg-canvas/70 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={`${senior.firstName} ${senior.lastName}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Proche suivi</p>
          {seniors.length > 1 ? (
            <Select aria-label="Choisir le proche suivi" value={senior._id} onChange={(e) => select(e.target.value)} className="mt-0.5 h-8 border-0 bg-transparent px-0 font-bold">
              {seniors.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </Select>
          ) : (
            <p className="truncate font-bold text-ink">
              {senior.firstName} {senior.lastName}
            </p>
          )}
        </div>
      </div>
      <button onClick={() => setCreating(true)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50">
        <Plus className="h-3.5 w-3.5" /> Ajouter un proche
      </button>
    </div>
  );

  return (
    <AppShell nav={nav} spaceLabel="Espace Aidant" home="/aidant" sidebarExtra={selector}>
      {loading ? <Spinner /> : senior ? children : <Onboarding />}
      <CreateSeniorModal open={creating} onClose={() => setCreating(false)} />
    </AppShell>
  );
}
