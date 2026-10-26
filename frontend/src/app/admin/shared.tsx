"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  AudioLines,
  Bot,
  Brain,
  CalendarRange,
  CheckCircle2,
  Info,
  Lightbulb,
  Mic,
  ScanText,
  type LucideIcon,
} from "lucide-react";
import type { AiCall } from "@/lib/types";
import { Badge, Card, cx } from "@/components/ui";
import { Spark } from "@/components/admin/charts";
import type { Insight, KpiCardData } from "./types";

/* ---------- Libellés ---------- */

export const CAPABILITIES: Record<"llm" | "stt" | "tts" | "ocr", { label: string; short: string; icon: LucideIcon }> = {
  llm: { label: "Modèles de langage (LLM)", short: "Dialogue / LLM", icon: Brain },
  stt: { label: "Reconnaissance vocale (STT)", short: "Reconnaissance vocale", icon: Mic },
  tts: { label: "Synthèse vocale (TTS)", short: "Synthèse vocale", icon: AudioLines },
  ocr: { label: "Lecture de documents (OCR)", short: "OCR", icon: ScanText },
};

export const ACTION_LABELS: Record<string, string> = {
  connexion: "Connexion à l'espace aidant",
  interaction_vocale: "Échange avec l'assistant",
  rappel_cree: "Rappel créé",
  prise_confirmee: "Prise de médicament confirmée",
  appel_manquee: "Appels manqués",
  document_traite: "Document expliqué",
  souvenir_ecoute: "Souvenir écouté",
  appel_proche: "Appel d'un proche",
  sos: "SOS déclenché",
  traitement_saisi: "Traitement saisi",
  evenement_cree: "Événement ajouté à l'agenda",
  synthese_generee: "Synthèse générée",
  synthese_consultee: "Synthèse consultée",
  alerte_traitee: "Alerte traitée",
};

export const fmtNum = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: digits }));
export const fmtSec = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`);
export const dayLabel = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/* ---------- Onglet piloté par l'ancre de l'URL (#rapports, #comptes…) ---------- */

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useHashTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const current = (tabs as readonly string[]).includes(hash) ? (hash as T) : fallback;
  const set = (t: T) => {
    window.history.replaceState(null, "", `#${t}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  return [current, set];
}

/* ---------- Période d'analyse partagée entre les pages ---------- */

const PERIODS = [7, 30, 90] as const;
const PeriodCtx = createContext<{ days: number; setDays: (d: number) => void }>({ days: 7, setDays: () => {} });

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  // Monté uniquement côté client (après vérification de la session) : lecture directe sans risque d'hydratation
  const [days, setDaysState] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem("sa_admin_days"));
      return PERIODS.includes(saved as 7) ? saved : 7;
    } catch {
      return 7;
    }
  });
  const setDays = (d: number) => {
    setDaysState(d);
    try {
      window.localStorage.setItem("sa_admin_days", String(d));
    } catch {}
  };
  return <PeriodCtx.Provider value={{ days, setDays }}>{children}</PeriodCtx.Provider>;
}

export const usePeriod = () => useContext(PeriodCtx);

export function PeriodSelect() {
  const { days, setDays } = usePeriod();
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  const f = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return (
    <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink shadow-card">
      <CalendarRange className="h-4 w-4 text-brand-600" aria-hidden="true" />
      <span className="hidden sm:inline">
        {f(from)} – {f(to)}
      </span>
      <select aria-label="Période d'analyse" value={days} onChange={(e) => setDays(Number(e.target.value))} className="cursor-pointer bg-transparent font-bold text-brand-700 focus:outline-none">
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {p} jours
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-900 sm:text-[28px]">{title}</h1>
        <p className="mt-1 text-[15px] text-muted">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <PeriodSelect />
      </div>
    </div>
  );
}

/* ---------- Info-bulle de définition d'un indicateur ---------- */

export function InfoTip({ children, label = "Définition de l'indicateur" }: { children: React.ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={label} className="rounded-full text-slate-400 hover:text-brand-600 focus:text-brand-600">
        <Info className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-6 z-30 hidden w-72 rounded-xl border border-line bg-white p-3 text-left text-xs font-normal leading-relaxed text-ink shadow-pop group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}

/* ---------- Variation par rapport à la période précédente ---------- */

export function Delta({ value, better = "up", suffix = "%" }: { value: number | null; better?: "up" | "down"; suffix?: string }) {
  if (value == null) return <span className="text-xs text-muted">—</span>;
  const good = value === 0 ? null : (value > 0) === (better === "up");
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-sm font-bold", good === null ? "text-muted" : good ? "text-ok-600" : "text-danger-600")}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} {suffix}
      <span className="sr-only">{good ? "(amélioration)" : good === false ? "(dégradation)" : ""}</span>
    </span>
  );
}

/* ---------- Carte KPI ---------- */

export function KpiCard({ kpi, icon: Icon, tone, color, days }: { kpi: KpiCardData; icon: LucideIcon; tone: string; color: string; days: number }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", tone)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="flex-1 text-xs font-extrabold uppercase tracking-wide text-muted">{kpi.family}</p>
        <InfoTip>
              <b className="block text-ink">{kpi.label}</b>
              {kpi.definition}
              <span className="mt-2 block text-muted">
                Période : {days} derniers jours · Source : {kpi.source}
              </span>
        </InfoTip>
      </div>
      <p className="mt-3 text-sm font-bold leading-snug text-ink">{kpi.label}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="whitespace-nowrap text-3xl font-black text-ink">
            {fmtNum(kpi.value)}
            {kpi.value != null && kpi.unit && <span className="ml-1 text-xl">{kpi.unit === "%" ? "%" : kpi.unit}</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            <Delta value={kpi.delta} better={kpi.better} />
            <span className="text-xs text-muted">vs période préc.</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">{kpi.hint}</p>
        </div>
        <Spark values={kpi.spark} color={color} />
      </div>
    </Card>
  );
}

/* ---------- Insight & recommandation ---------- */

export const SEVERITY: Record<Insight["severity"], { label: string; icon: LucideIcon; badge: "danger" | "warn" | "brand" | "ok"; bar: string }> = {
  critique: { label: "Critique", icon: AlertOctagon, badge: "danger", bar: "bg-danger-500" },
  attention: { label: "À surveiller", icon: AlertTriangle, badge: "warn", bar: "bg-warn-500" },
  info: { label: "Information", icon: Lightbulb, badge: "brand", bar: "bg-brand-500" },
  ok: { label: "Objectif atteint", icon: CheckCircle2, badge: "ok", bar: "bg-ok-500" },
};

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const s = SEVERITY[insight.severity];
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white p-4 pl-5">
      <span className={cx("absolute inset-y-0 left-0 w-1", s.bar)} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.badge}>
          <s.icon className="h-3.5 w-3.5" /> {s.label}
        </Badge>
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {insight.category} — {insight.module}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-muted"
          title={insight.source === "ia" ? `Rédigée par ${insight.provider} à partir des indicateurs, chiffres vérifiés` : "Règle déterministe (aucun LLM disponible)"}
        >
          {insight.source === "ia" ? <Bot className="h-3.5 w-3.5 text-violet-500" /> : <Lightbulb className="h-3.5 w-3.5" />}
          {insight.source === "ia" ? insight.provider : "Règle"}
        </span>
      </div>
      <h3 className="mt-2 font-extrabold text-ink">{insight.title}</h3>
      <p className={cx("mt-1 text-sm text-muted", compact && "line-clamp-3")}>{insight.observation}</p>
      <p className="mt-auto pt-3 text-sm">
        <span className="font-bold text-brand-700">Action suggérée : </span>
        <span className="text-ink">{insight.action}</span>
      </p>
    </article>
  );
}

export function CallStatus({ call }: { call: AiCall }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {call.status === "succes" ? <Badge tone="ok">Succès</Badge> : <Badge tone="danger">Erreur</Badge>}
      {call.fallback && <Badge tone="warn">Secours</Badge>}
    </span>
  );
}
