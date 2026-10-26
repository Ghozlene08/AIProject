"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCaregiverId } from "@/lib/token";

export type SosSenior = { _id: string; firstName: string; lastName: string; photoUrl?: string };

export type SosItem = {
  _id: string;
  type: "sos";
  severity: "haute" | "moyenne" | "info";
  title: string;
  message?: string;
  read: boolean;
  createdAt: string;
  senior: SosSenior | null; // populated by the backend
};

export type SosHistory = {
  alerts: SosItem[];
  seniors: SosSenior[];
  total: number;
  unreadCount: number;
  totalAll: number;
  page: number;
  pages: number;
};

export type SosFilters = {
  status: "all" | "unread" | "read";
  seniorId: string;
  from: string; // yyyy-mm-dd
  to: string;
  page: number;
};

export const DEFAULT_FILTERS: SosFilters = { status: "all", seniorId: "", from: "", to: "", page: 1 };

export function useSosHistory(filters: SosFilters) {
  const [data, setData] = useState<SosHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, seniorId, from, to, page } = filters;

  const load = useCallback(async () => {
    const caregiverId = getCaregiverId();
    if (!caregiverId) {
      setError("Session expirée. Reconnectez-vous.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ status, page: String(page), limit: "15" });
    if (seniorId) params.set("seniorId", seniorId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      setLoading(true);
      const res: any = await api.get(`/aidant/caregivers/${caregiverId}/sos?${params}`);
      setData(res?.alerts ? res : res?.data); // works whether api.get returns the body or { data }
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger l'historique des SOS.");
    } finally {
      setLoading(false);
    }
  }, [status, seniorId, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}