"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Senior } from "@/lib/types";

const KEY = "sa_senior";

interface SeniorState {
  seniors: Senior[];
  senior: Senior | null;
  loading: boolean;
  select: (id: string) => void;
  reload: () => Promise<void>;
  unread: number;
  refreshUnread: () => void;
  /** Préfixe des routes API du senior sélectionné */
  base: string;
}

const Ctx = createContext<SeniorState | null>(null);

export function SeniorProvider({ children }: { children: React.ReactNode }) {
  const [seniors, setSeniors] = useState<Senior[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  const apply = useCallback((list: Senior[]) => {
    setSeniors(list);
    setSelected((cur) => {
      const saved = cur ?? window.localStorage.getItem(KEY);
      return list.find((s) => s._id === saved)?._id ?? list[0]?._id ?? null;
    });
    setLoading(false);
  }, []);

  const reload = useCallback(async () => {
    const { seniors } = await api.get<{ seniors: Senior[] }>("/aidant/seniors");
    apply(seniors);
  }, [apply]);

  useEffect(() => {
    api
      .get<{ seniors: Senior[] }>("/aidant/seniors")
      .then((r) => apply(r.seniors))
      .catch(() => setLoading(false));
  }, [apply]);

  const senior = seniors.find((s) => s._id === selected) ?? null;
  const base = senior ? `/aidant/seniors/${senior._id}` : "";

  const refreshUnread = useCallback(() => {
    if (!base) return;
    api
      .get<{ alerts: unknown[] }>(`${base}/alerts?unread=true`)
      .then((r) => setUnread(r.alerts.length))
      .catch(() => {});
  }, [base]);

  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 60_000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  const select = useCallback((id: string) => {
    window.localStorage.setItem(KEY, id);
    setSelected(id);
  }, []);

  return (
    <Ctx.Provider value={{ seniors, senior, loading, select, reload, unread, refreshUnread, base }}>{children}</Ctx.Provider>
  );
}

export function useSenior() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSenior doit être utilisé dans <SeniorProvider>");
  return ctx;
}

// Variante pour les pages : le senior est garanti (la coquille affiche l'accueil sinon)
export function useCurrentSenior() {
  const ctx = useSenior();
  return { ...ctx, senior: ctx.senior as Senior };
}
