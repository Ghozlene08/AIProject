"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  HelpCircle,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Siren,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, ErrorBox, cx } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";
import { ALERT_STYLE } from "../alertStyle";

type RiskAnalysis = {
  seniorId: string;
  period: { from: string; to: string; days: number };
  totalAlerts: number;
  countsByType: Record<string, number>;
  countsBySeverity: Record<string, number>;
  analysis: string; // markdown written by the model
  model?: string;
};

type Level = "high" | "medium" | "low";

const LEVEL_UI: Record<Level, { label: string; badge: string; box: string }> = {
  high: { label: "Risque élevé", badge: "bg-danger-500 text-white", box: "border-danger-500 bg-danger-500/10" },
  medium: { label: "Risque modéré", badge: "bg-amber-500 text-white", box: "border-amber-500 bg-amber-50" },
  low: { label: "Risque faible", badge: "bg-ok-500 text-white", box: "border-ok-500 bg-ok-500/10" },
};

// Level computed from the real counts, not from the AI text. Adjust the thresholds.
function computeLevel(r: RiskAnalysis): Level {
  const sos = r.countsByType?.sos ?? 0;
  const high = r.countsBySeverity?.haute ?? 0;
  if (sos >= 3 || high >= 5) return "high";
  if (sos >= 1 || high >= 1) return "medium";
  return "low";
}

/* ------------------------------------------------------------------ */
/* Markdown from the model → sections                                  */
/* ------------------------------------------------------------------ */

type Section = { title: string; items: { text: string; bullet: boolean }[] };

function parseAnalysis(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of md.split("\n")) {
    const t = line.trim();
    if (!t) continue;

    const heading = t.match(/^(?:#{1,4}\s*)?\*\*(.+?)\*\*:?$/) || t.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      current = { title: heading[1].trim(), items: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: "Analyse", items: [] };
      sections.push(current);
    }

    const bullet = /^[-*•]\s+/.test(t);
    current.items.push({ text: t.replace(/^[-*•]\s+/, ""), bullet });
  }
  return sections;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-extrabold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function sectionMeta(title: string) {
  if (/fact|constat/i.test(title)) {
    return { label: "Faits constatés", icon: AlertTriangle, box: "border-line bg-white", iconCls: "text-danger-500" };
  }
  if (/unknown|inconnu/i.test(title)) {
    return { label: "Ce qui reste inconnu", icon: HelpCircle, box: "border-amber-200 bg-amber-50/60", iconCls: "text-amber-600" };
  }
  if (/action|recommend|conseil/i.test(title)) {
    return { label: "Actions recommandées", icon: ListChecks, box: "border-brand-100 bg-brand-50/60", iconCls: "text-brand-600" };
  }
  return { label: title, icon: Sparkles, box: "border-line bg-white", iconCls: "text-muted" };
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/* ------------------------------------------------------------------ */
/* Loading state: steps + skeleton shaped like the final report        */
/* ------------------------------------------------------------------ */

const STEPS = ["Lecture des alertes de la semaine", "Analyse par l'IA en cours", "Finalisation du rapport"];

function AnalysisLoading({ elapsed }: { elapsed: number }) {
  // The AI step is the long one, so the last step only shows when it is really slow
  const step = elapsed < 2 ? 0 : elapsed < 25 ? 1 : 2;

  return (
    <div className="space-y-5" role="status" aria-live="polite">
      {/* Étapes */}
      <ol className="space-y-2.5">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-colors",
                  done ? "bg-ok-500" : active ? "bg-brand-600" : "bg-slate-200",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : active ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : null}
              </span>
              <span className={cx("text-sm", active ? "font-bold text-ink" : done ? "font-semibold text-muted" : "text-slate-400")}>
                {label}
                {active && "…"}
              </span>
              {active && <span className="ml-auto text-xs font-semibold tabular-nums text-muted">{elapsed} s</span>}
            </li>
          );
        })}
      </ol>

      {/* Squelette du rapport */}
      <div className="animate-pulse space-y-4" aria-hidden>
        <div className="flex items-center gap-4 rounded-2xl bg-slate-100 p-4">
          <div className="h-14 w-14 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-28 rounded-full bg-slate-200" />
            <div className="h-4 w-52 rounded bg-slate-200" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-11/12 rounded bg-slate-100" />
          <div className="h-3 w-4/6 rounded bg-slate-100" />
        </div>
      </div>

      {elapsed >= 25 && (
        <p className="text-xs font-semibold text-muted">Le modèle local met un peu plus de temps que d&apos;habitude, merci de patienter.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type Props = {
  autoRun?: boolean; // start the analysis as soon as the component mounts
  embedded?: boolean; // true = no card of its own, to live inside another container
  onClose?: () => void; // shows a close button when provided
};

export default function RiskReport({ autoRun = false, embedded = false, onClose }: Props) {
  const { senior, base } = useCurrentSenior();
  const [report, setReport] = useState<RiskAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const run = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res: any = await api.get(`${base}/risk-analysis`);
      setReport(res?.analysis !== undefined ? res : res?.data);
    } catch (e: any) {
      setError(e?.message || "Impossible de générer l'analyse de risque.");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (autoRun) run();
  }, [autoRun, run]);

  // Seconds counter shown while the analysis runs
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const level = report ? computeLevel(report) : null;
  const ui = level ? LEVEL_UI[level] : null;
  const sections = report ? parseAnalysis(report.analysis || "") : [];
  const sosCount = report?.countsByType?.sos ?? 0;

  const content = (
    <div>
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-ink">Analyse de risque SOS</h2>
          <p className="text-xs font-semibold text-muted">
            {report ? `Du ${fmtDay(report.period.from)} au ${fmtDay(report.period.to)} · ${report.period.days} jours` : `Pour ${senior.firstName} · 7 derniers jours`}
          </p>
        </div>
        <Button variant={report ? "outline" : undefined} size="sm" onClick={run} disabled={loading}>
          <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
          {loading ? "Analyse…" : report ? "Relancer" : "Lancer l'analyse"}
        </Button>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer le rapport"
            className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-5 px-5 pb-5">
        {!report && !loading && !error && (
          <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
            Lancez l&apos;analyse pour obtenir un bilan des alertes SOS des 7 derniers jours.
          </p>
        )}

        {loading && <AnalysisLoading elapsed={elapsed} />}

        {error && !loading && <ErrorBox>{error}</ErrorBox>}

        {report && ui && !loading && (
          <div className="fade-up space-y-5">
            {/* Niveau + compteur SOS */}
            <div className={cx("flex flex-wrap items-center gap-4 rounded-2xl border-l-4 p-4", ui.box)}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-card">
                <Siren className={cx("h-7 w-7", sosCount > 0 ? "text-danger-500" : "text-ok-500")} />
              </div>
              <div className="min-w-0 flex-1">
                <span className={cx("rounded-full px-3 py-1 text-xs font-black", ui.badge)}>{ui.label}</span>
                <p className="mt-2 text-lg font-black text-ink">
                  {sosCount} alerte{sosCount > 1 ? "s" : ""} SOS sur {report.period.days} jours
                </p>
                <p className="text-xs font-semibold text-muted">Niveau calculé à partir des alertes enregistrées</p>
              </div>
             
            </div>

            {/* Chiffres clés */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs font-bold text-muted">Total des alertes</p>
                <p className="text-2xl font-black text-ink">{report.totalAlerts}</p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs font-bold text-muted">Priorité haute</p>
                <p className="text-2xl font-black text-danger-600">{report.countsBySeverity?.haute ?? 0}</p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs font-bold text-muted">Priorité moyenne / info</p>
                <p className="text-2xl font-black text-ink">
                  {(report.countsBySeverity?.moyenne ?? 0) + (report.countsBySeverity?.info ?? 0)}
                </p>
              </div>
            </div>

            {/* Répartition par type */}
            {Object.keys(report.countsByType || {}).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.countsByType).map(([type, count]) => {
                  const s = ALERT_STYLE[type as keyof typeof ALERT_STYLE];
                  const Icon = s?.icon;
                  return (
                    <span
                      key={type}
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                        type === "sos" ? "bg-danger-500/10 text-danger-600" : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {s?.label ?? type} · {count}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Texte généré par le modèle */}
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-bold text-muted">
                <Sparkles className="h-3.5 w-3.5" />
                Rapport généré par IA{report.model ? ` (${report.model})` : ""} · à vérifier avec les chiffres ci-dessus
              </p>

              {sections.map((sec, i) => {
                const meta = sectionMeta(sec.title);
                const Icon = meta.icon;
                return (
                  <div key={i} className={cx("rounded-xl border p-4", meta.box)}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink">
                      <Icon className={cx("h-4 w-4", meta.iconCls)} /> {meta.label}
                    </h3>
                    <ul className="space-y-1.5">
                      {sec.items.map((it, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
                          {it.bullet && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />}
                          <span>
                            <Inline text={it.text} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Embedded: lives inside the parent's container. Standalone: wraps itself in a card.
  return embedded ? content : <Card>{content}</Card>;
}