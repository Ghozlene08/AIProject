"use client";

import { useState } from "react";
import { CheckCircle2, Lock, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, CardHeader, ErrorBox, Input, Spinner, Toggle } from "@/components/ui";
import type { PlatformSettings } from "../types";

type Thresholds = PlatformSettings["thresholds"];
type Privacy = PlatformSettings["privacy"];

const THRESHOLDS: { key: keyof Thresholds; label: string; unit: string; help: string; scale?: number }[] = [
  { key: "latencyP95TargetMs", label: "Objectif de latence P95", unit: "s", scale: 1000, help: "Exigence du cahier des charges : réponse vocale en moins de 4 s pour 95 % des demandes." },
  { key: "voiceSuccessMin", label: "Réussite minimale par intention vocale", unit: "%", help: "En dessous, l'intention est signalée avec sa première cause d'échec." },
  { key: "intakeConfirmMin", label: "Prises confirmées minimales", unit: "%", help: "En dessous, une recommandation sur les rappels de prise est émise." },
  { key: "documentSuccessMin", label: "Documents expliqués minimaux", unit: "%", help: "Taux de réussite attendu de « Photo → Compris »." },
  { key: "errorRateMax", label: "Taux d'erreur maximal par fournisseur", unit: "%", help: "Au-delà, le fournisseur est signalé comme critique." },
  { key: "fallbackRateMax", label: "Recours maximal au secours", unit: "%", help: "Au-delà, le fournisseur principal est probablement saturé ou mal configuré." },
  { key: "quotaWarnPct", label: "Alerte de consommation de quota", unit: "%", help: "Part du quota gratuit quotidien à partir de laquelle on prévient." },
  { key: "inactivityDays", label: "Inactivité d'un compte", unit: "jours", help: "Un senior ou un aidant sans activité depuis ce délai est considéré inactif." },
];

function useSettings() {
  return useApi<{ settings: PlatformSettings }>("/admin/settings");
}

function SaveBar({ saving, saved, error, onSave }: { saving: boolean; saved: boolean; error: string; onSave: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
      {saved && (
        <span className="flex items-center gap-1.5 text-sm font-bold text-ok-600">
          <CheckCircle2 className="h-4 w-4" /> Enregistré
        </span>
      )}
      <ErrorBox>{error}</ErrorBox>
      <Button onClick={onSave} loading={saving}>
        Enregistrer
      </Button>
    </div>
  );
}

export function ThresholdsPanel() {
  const { data, loading } = useSettings();
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  return <ThresholdsForm initial={data.settings.thresholds} />;
}

function ThresholdsForm({ initial }: { initial: Thresholds }) {
  const [values, setValues] = useState<Thresholds>(initial);
  const [state, setState] = useState({ saving: false, saved: false, error: "" });

  async function save() {
    setState({ saving: true, saved: false, error: "" });
    try {
      await api.put("/admin/settings", { thresholds: values });
      setState({ saving: false, saved: true, error: "" });
    } catch (err) {
      setState({ saving: false, saved: false, error: (err as Error).message });
    }
  }

  return (
    <Card>
      <CardHeader title="Seuils d'alerte" subtitle="Utilisés par les insights & recommandations et par les indicateurs colorés" icon={<SlidersHorizontal className="h-5 w-5" />} />
      <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
        {THRESHOLDS.map((t) => (
          <label key={t.key} className="rounded-xl border border-line p-4">
            <span className="block text-sm font-bold text-ink">{t.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{t.help}</span>
            <span className="mt-3 flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={t.scale ? 0.1 : 1}
                value={t.scale ? values[t.key] / t.scale : values[t.key]}
                onChange={(e) => setValues({ ...values, [t.key]: Number(e.target.value) * (t.scale ?? 1) })}
                className="w-28"
              />
              <span className="text-sm font-semibold text-muted">{t.unit}</span>
            </span>
          </label>
        ))}
      </div>
      <SaveBar saving={state.saving} saved={state.saved} error={state.error} onSave={save} />
    </Card>
  );
}

export function PrivacyPanel() {
  const { data, loading } = useSettings();
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  return <PrivacyForm initial={data.settings.privacy} />;
}

function PrivacyForm({ initial }: { initial: Privacy }) {
  const [values, setValues] = useState<Privacy>(initial);
  const [state, setState] = useState({ saving: false, saved: false, error: "" });

  async function save() {
    setState({ saving: true, saved: false, error: "" });
    try {
      await api.put("/admin/settings", { privacy: values });
      setState({ saving: false, saved: true, error: "" });
    } catch (err) {
      setState({ saving: false, saved: false, error: (err as Error).message });
    }
  }

  return (
    <Card>
      <CardHeader title="Confidentialité" subtitle="Protection des données des seniors dans les journaux et les statistiques" icon={<Lock className="h-5 w-5" />} />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-ok-50 p-4">
          <div>
            <p className="font-bold text-ink">Anonymisation avant chaque appel IA</p>
            <p className="text-sm text-muted">Noms et numéros remplacés par des jetons ([PERSONNE_1], [TEL_1]). Toujours active, non désactivable.</p>
          </div>
          <Lock className="h-5 w-5 shrink-0 text-ok-600" aria-label="Verrouillé" />
        </div>
        <Row title="Conserver l'aperçu des prompts anonymisés" text="Utile au diagnostic dans les journaux techniques. Désactivé : seul le statut de l'appel est conservé.">
          <Toggle label="Conserver l'aperçu des prompts" checked={values.storePromptPreview} onChange={(v) => setValues({ ...values, storePromptPreview: v })} />
        </Row>
        <Row title="Abréger les noms des seniors" text="Dans l'administration, « Marie Dupont » devient « Marie D. ».">
          <Toggle label="Abréger les noms" checked={values.maskSeniorNames} onChange={(v) => setValues({ ...values, maskSeniorNames: v })} />
        </Row>
        <Row title="Durée de conservation des journaux" text="Les appels IA et événements d'usage plus anciens sont supprimés automatiquement.">
          <span className="flex items-center gap-2">
            <Input type="number" min={7} max={365} value={values.logRetentionDays} onChange={(e) => setValues({ ...values, logRetentionDays: Number(e.target.value) })} className="w-24" aria-label="Durée de conservation en jours" />
            <span className="text-sm text-muted">jours</span>
          </span>
        </Row>
        <Row title="Taille minimale d'un groupe statistique" text="Les villes comptant moins de seniors que ce seuil sont regroupées, pour éviter toute ré-identification.">
          <Input type="number" min={1} value={values.minGroupSize} onChange={(e) => setValues({ ...values, minGroupSize: Number(e.target.value) })} className="w-24" aria-label="Taille minimale d'un groupe" />
        </Row>
      </div>
      <SaveBar saving={state.saving} saved={state.saved} error={state.error} onSave={save} />
    </Card>
  );
}

function Row({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line p-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}
