"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BellOff, CheckCheck, CheckCircle2, Send, ShieldAlert, Siren, Sparkles, Trash2, X } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { getSocket, useSosEvents } from "@/lib/socket";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import type { Alert, AlertType } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, IconBubble, PageHeader, Spinner, cx } from "@/components/ui";
import { useCurrentSenior } from "../SeniorContext";
import { ALERT_STYLE } from "../alertStyle";
import RiskReport from "../synthese/RiskReport";

const FILTERS: { value: "" | "unread" | AlertType; label: string }[] = [
  { value: "", label: "Toutes" },
  { value: "unread", label: "Non lues" },
  { value: "appel_manque", label: "Appels manqués" },
  { value: "sos", label: "SOS" },
  { value: "checkin_manque", label: "Check-ins manqués" },
  { value: "synthese", label: "Synthèses" },
];

const URGENT_TYPES: AlertType[] = ["sos", "checkin_manque"];

const TOAST_DURATION_MS = 4000;

type SosSummary = {
  alerts: Alert[];
  activeCount: number;
  sosCount: number;
  checkinCount: number;
};

// Types that support the bulk "clear treated history" action
type BulkType = "sos" | "checkin_manque" | "appel_manque";

const BULK_LABEL: Record<BulkType, string> = {
  sos: "alertes SOS",
  checkin_manque: "check-ins manqués",
  appel_manque: "appels manqués",
};

// What the confirmation dialog is currently asking about
type ConfirmState = { kind: "one"; alert: Alert } | { kind: "bulk"; type: BulkType } | null;

export default function AlertesClient() {
  const { senior, base, refreshUnread } = useCurrentSenior();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("");
  const [riskStarted, setRiskStarted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const query = filter === "unread" ? qs({ unread: true }) : qs({ type: filter });

  const { data, error, loading, reload } = useApi<{ alerts: Alert[] }>(`${base}/alerts${query}`);

  const { data: sosData, reload: reloadSos } = useApi<SosSummary>(`${base}/sos?unread=true&limit=5`);
  const activeUrgent = sosData?.activeCount ?? 0;
  const sosCount = sosData?.sosCount ?? 0;
  const checkinCount = sosData?.checkinCount ?? 0;

  const refreshAll = () => {
    reload();
    reloadSos();
    refreshUnread();
  };

  useSosEvents(refreshAll);

  // A missed call just created an alert: refresh the list live
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onNewAlert = () => refreshAll();
    s.on("alert:new", onNewAlert);
    return () => {
      s.off("alert:new", onNewAlert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, query]);

  // Reload when the emergency popup marks an alert as handled
  useEffect(() => {
    const onHandled = () => refreshAll();
    window.addEventListener("sos:handled", onHandled);
    return () => window.removeEventListener("sos:handled", onHandled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, query]);

  // While the dialog is open: Escape closes it, and the page behind does not scroll
  useEffect(() => {
    if (!confirm) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) setConfirm(null);
    };
    window.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [confirm, deleting]);

  // The success message hides itself after a few seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const errorMessage = (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback;

  async function toggleRead(a: Alert) {
    setActionError(null);
    try {
      await api.patch(`${base}/alerts/${a._id}`, { read: !a.read });
      refreshAll();
    } catch (err) {
      console.error("Could not update alert", err);
      setActionError(errorMessage(err, "Impossible de mettre à jour l'alerte."));
    }
  }

  async function readAll() {
    setActionError(null);
    try {
      await api.patch(`${base}/alerts/read-all`);
      refreshAll();
    } catch (err) {
      console.error("Could not mark all alerts as read", err);
      setActionError(errorMessage(err, "Impossible de marquer les alertes comme lues."));
    }
  }

  // Bulk cleanup is offered on the SOS / Check-ins manqués / Appels manqués filters
  const canClean = filter === "sos" || filter === "checkin_manque" || filter === "appel_manque";

  // Step 1: the buttons only OPEN the confirmation dialog
  function askDeleteOne(a: Alert) {
    if (deleting) return;
    setConfirm({ kind: "one", alert: a });
  }

  function askCleanHistory() {
    if (deleting || !canClean) return;
    setConfirm({ kind: "bulk", type: filter as BulkType });
  }

  // Step 2: the dialog's "Supprimer" button runs the real deletion
  async function runDelete() {
    if (!confirm || deleting) return;
    setActionError(null);
    setToast(null);
    setDeleting(true);
    try {
      if (confirm.kind === "one") {
        await api.del(`${base}/alerts/${confirm.alert._id}`);
        setToast("Alerte supprimée avec succès.");
      } else {
        // The backend answers { deleted: n } for the bulk cleanup
        const res = (await api.del(`${base}/alerts${qs({ type: confirm.type })}`)) as unknown as
          | { deleted?: number }
          | undefined;
        const n = res?.deleted;

        if (n === 0) setToast("Aucune alerte traitée à supprimer.");
        else if (typeof n === "number") setToast(`${n} ${n > 1 ? "alertes supprimées" : "alerte supprimée"} avec succès.`);
        else setToast("Historique supprimé avec succès.");
      }
      refreshAll();
    } catch (err) {
      console.error("Could not delete", err);
      setActionError(
        errorMessage(
          err,
          confirm.kind === "one" ? "Impossible de supprimer l'alerte." : "Impossible de vider l'historique.",
        ),
      );
    } finally {
      setDeleting(false);
      setConfirm(null);
    }
  }

  const alerts = data?.alerts ?? [];
  const showReport = filter === "synthese";
  const hasTreated = alerts.some((a) => a.read);

  // Banner: say exactly what is waiting
  const bannerTitle =
    sosCount > 0 && checkinCount > 0
      ? `${activeUrgent} urgences non traitées`
      : sosCount > 0
        ? sosCount > 1
          ? `${sosCount} alertes SOS non traitées`
          : "Alerte SOS non traitée"
        : checkinCount > 1
          ? `${checkinCount} check-ins sans réponse`
          : "Check-in sans réponse";

  const bannerText =
    sosCount > 0
      ? `${senior.firstName} a demandé de l'aide.`
      : `${senior.firstName} n'a pas répondu à la demande de confirmation.`;

  // Per-filter urgent counter shown on the pill
  const pillCount = (value: string) =>
    value === "sos" ? sosCount : value === "checkin_manque" ? checkinCount : 0;

  // Texts of the confirmation dialog
  const confirmTitle = confirm?.kind === "one" ? "Supprimer cette alerte ?" : "Vider l'historique traité ?";
  const confirmText =
    confirm?.kind === "bulk"
      ? `Tous les ${BULK_LABEL[confirm.type]} déjà traités de ${senior.firstName} seront supprimés définitivement. Les alertes non traitées sont conservées.`
      : "Cette action est définitive : l'alerte ne pourra pas être récupérée.";

  return (
    <div className="fade-up">
      <PageHeader
        title="Alertes"
        subtitle={`Événements importants concernant ${senior.firstName}`}
        action={
          <Button variant="outline" onClick={readAll}>
            <CheckCheck className="h-4 w-4" /> Tout marquer comme lu
          </Button>
        }
      />

      {activeUrgent > 0 && (
        <div role="alert" className="mb-5 flex items-center gap-4 rounded-2xl bg-danger-500 px-6 py-4 text-white shadow-pop">
          <Siren className="h-8 w-8 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black">{bannerTitle}</p>
            <p className="text-sm font-semibold opacity-90">{bannerText}</p>
          </div>
          <button
            onClick={() => setFilter(sosCount > 0 ? "sos" : "checkin_manque")}
            className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold hover:bg-white/30"
          >
            Voir
          </button>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = pillCount(f.value);
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
                filter === f.value ? "bg-brand-600 text-white" : "bg-white text-muted shadow-card hover:text-brand-700",
              )}
            >
              {f.label}
              {n > 0 && (
                <span className="rounded-full bg-danger-500 px-1.5 text-[11px] font-black leading-5 text-white">{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bulk cleanup, on the SOS / Check-ins manqués / Appels manqués filters */}
      {canClean && hasTreated && (
        <div className="mb-3 flex justify-end">
          <Button variant="outline" onClick={askCleanHistory} disabled={deleting}>
            <Trash2 className="h-4 w-4" /> Vider l&apos;historique traité
          </Button>
        </div>
      )}

      {error && !data && <ErrorBox>{error}</ErrorBox>}
      {actionError && (
        <div className="mb-3">
          <ErrorBox>{actionError}</ErrorBox>
        </div>
      )}

      <Card>
        {showReport && !riskStarted && (
          <div className="p-5">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-100 bg-brand-50/40 px-6 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <p className="font-extrabold text-ink">Rapport d&apos;analyse de risque</p>
                <p className="mt-1 text-sm text-muted">
                  Bilan des alertes SOS de {senior.firstName} sur les 7 derniers jours, rédigé par l&apos;IA.
                </p>
              </div>
              <Button onClick={() => setRiskStarted(true)}>
                <Sparkles className="h-4 w-4" /> Lancer l&apos;analyse
              </Button>
            </div>
          </div>
        )}

        {riskStarted && (
          <div
            className={cx(
              showReport ? "block" : "hidden",
              alerts.length > 0 && "border-b border-line",
              "bg-gradient-to-b from-brand-50/60 to-white",
            )}
          >
            <RiskReport embedded autoRun />
          </div>
        )}

        {loading && !data ? (
          !showReport && <Spinner />
        ) : alerts.length > 0 ? (
          <ul className="divide-y divide-line">
            {alerts.map((a) => {
              const s = ALERT_STYLE[a.type];
              const isUrgent = URGENT_TYPES.includes(a.type);
              const isActiveUrgent = isUrgent && !a.read;

              return (
                <li
                  key={a._id}
                  className={cx(
                    "flex items-start gap-4 px-5 py-4",
                    !a.read && "bg-brand-50/40",
                    isActiveUrgent && "border-l-4 border-danger-500 bg-danger-500/10",
                  )}
                >
                  <IconBubble tone={s.tone}>
                    <s.icon className={cx("h-5 w-5", isActiveUrgent && "animate-pulse")} />
                  </IconBubble>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      {a.title}
                      {a.severity === "haute" && <Badge tone="danger">Prioritaire</Badge>}
                      {isUrgent && (a.read ? <Badge tone="ok">Traité</Badge> : <Badge tone="danger">Non traité</Badge>)}
                      {a.sentTelegram && (
                        <Badge tone="brand">
                          <Send className="h-3 w-3" /> Telegram
                        </Badge>
                      )}
                    </p>
                    {a.message && <p className="mt-0.5 text-sm text-muted">{a.message}</p>}
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {fmtDateTime(a.createdAt)}
                      {isUrgent && ` · ${fmtRelative(a.createdAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggleRead(a)}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50"
                    >
                      {isUrgent ? (a.read ? "Rouvrir" : "Marquer traité") : a.read ? "Marquer non lue" : "Marquer lue"}
                    </button>

                    {/* An active urgent alert must be marked as treated before it can be deleted */}
                    {!isActiveUrgent && (
                      <button
                        onClick={() => askDeleteOne(a)}
                        disabled={deleting}
                        aria-label="Supprimer l'alerte"
                        title="Supprimer"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-danger-500/10 hover:text-danger-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : !showReport ? (
          <EmptyState icon={<BellOff className="h-6 w-6" />} title="Aucune alerte" text="Rien à signaler pour ce filtre." />
        ) : null}
      </Card>

      {/*
        Confirmation dialog, rendered in document.body through a portal.
        Outside the "fade-up" container, position: fixed is relative to the
        browser window again, so the overlay covers the whole screen and the
        card is centered in the viewport.
      */}
      {confirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            aria-describedby="confirm-delete-text"
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-[2px]"
            onClick={() => {
              if (!deleting) setConfirm(null);
            }}
          >
            <div
              className="my-auto w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-500/10 text-danger-600">
                <Trash2 className="h-7 w-7" />
              </div>

              <h2 id="confirm-delete-title" className="mt-4 text-xl font-black text-ink">
                {confirmTitle}
              </h2>

              {/* For a single alert, remind which one is about to be deleted */}
              {confirm.kind === "one" && (
                <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-left">
                  <p className="text-sm font-bold text-ink">{confirm.alert.title}</p>
                  <p className="text-xs font-semibold text-slate-400">{fmtDateTime(confirm.alert.createdAt)}</p>
                </div>
              )}

              <p id="confirm-delete-text" className="mt-3 text-sm text-muted">
                {confirmText}
              </p>

              <div className="mt-6 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)} disabled={deleting}>
                  Annuler
                </Button>
                <button
                  onClick={runDelete}
                  disabled={deleting}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-danger-600 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Suppression…" : "Supprimer"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/*
        Success message (toast), also rendered through a portal so it stays
        fixed at the bottom of the window. z-[90] keeps it above the dialog
        but below the emergency popup (z-[100]).
      */}
      {toast &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
            <div
              role="status"
              aria-live="polite"
              className="fade-up pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-2xl"
            >
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
              <p className="text-sm font-bold">{toast}</p>
              <button
                onClick={() => setToast(null)}
                aria-label="Fermer le message"
                className="ml-1 rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}