"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Check, ChevronLeft, Clock, Info, Loader2, Pill, Volume2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cx } from "@/components/ui";
import { speak, stopSpeaking } from "@/components/senior/voice";
import { type SeniorMedication, SeniorApiError, seniorApi, seniorToken } from "@/lib/seniorApi";
import { FaceLoginRequired, subscribe } from "../agenda/SeniorAgendaApp";

export function SeniorMedicamentsApp() {
  const token = useSyncExternalStore(subscribe, () => seniorToken.get() ?? "", () => "pending");
  if (token === "pending") return <div className="min-h-screen bg-canvas" />;
  return token ? <MedicamentsScreen /> : <FaceLoginRequired what="vos médicaments" />;
}

// « 08:30 » → « 8 heures 30 », mieux lu par la synthèse vocale
const spokenTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return m ? `${h} heures ${m}` : `${h} heures`;
};

function MedicamentsScreen() {
  const [meds, setMeds] = useState<SeniorMedication[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await seniorApi.get<{ medications: SeniorMedication[] }>("/medications");
      setMeds(res.medications);
      setError("");
    } catch (err) {
      setError(err instanceof SeniorApiError ? err.message : "Impossible de charger vos médicaments.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    // Les boutons « Je l'ai pris » apparaissent à l'heure, sans recharger la page
    const tick = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(tick);
      stopSpeaking();
    };
  }, [load]);

  async function confirm(intakeId: string) {
    setBusyId(intakeId);
    try {
      const res = await seniorApi.post<{ speech: string }>(`/intakes/${intakeId}/confirm`);
      speak(res.speech);
      await load();
    } catch (err) {
      setError(err instanceof SeniorApiError ? err.message : "Impossible d'enregistrer la prise.");
    } finally {
      setBusyId(null);
    }
  }

  function readAloud() {
    if (!meds) return;
    if (meds.length === 0) return speak("Vous n'avez aucun traitement en cours.");
    const parts = meds.map((m) => {
      const name = [m.name, m.dosage].filter(Boolean).join(" ");
      const when = m.times.map(spokenTime).join(" et à ");
      return `${name}, à ${when}${m.instructions ? `, ${m.instructions.toLowerCase()}` : ""}.`;
    });
    speak(`Vous avez ${meds.length === 1 ? "un traitement" : `${meds.length} traitements`}. ${parts.join(" ")}`, { natural: true });
  }

  const todayIntakes = meds?.flatMap((m) => m.today) ?? [];
  const taken = todayIntakes.filter((t) => t.status === "confirme").length;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex h-20 items-center border-b border-line bg-white px-4 sm:px-8">
        <Link href="/senior/connexion-reussie#accueil" className="flex min-h-14 items-center gap-2.5 rounded-2xl pr-3" aria-label="Revenir à l'accueil">
          <ChevronLeft className="h-7 w-7 text-brand-800" />
          <LogoMark className="h-9 w-9" />
          <span className="hidden text-xl font-extrabold tracking-tight text-brand-900 sm:inline">Accueil</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[36px] font-black tracking-tight text-brand-900">Mes médicaments</h1>
            {meds && todayIntakes.length > 0 && (
              <p className="mt-1 text-[24px] font-semibold text-ink">
                Aujourd&apos;hui : {taken} prise{taken > 1 ? "s" : ""} sur {todayIntakes.length}
              </p>
            )}
          </div>
          <button
            onClick={readAloud}
            disabled={!meds}
            className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-brand-200 bg-white px-5 text-[20px] font-extrabold text-brand-800 hover:bg-brand-50 disabled:opacity-60"
          >
            <Volume2 className="h-7 w-7" /> Écouter mon traitement
          </button>
        </div>

        {error && <p className="mt-6 rounded-2xl bg-danger-50 p-5 text-[22px] font-bold text-danger-700">{error}</p>}
        {!meds && !error && (
          <p className="mt-10 flex items-center justify-center gap-3 text-[22px] text-ink-soft">
            <Loader2 className="h-7 w-7 animate-spin" /> Chargement…
          </p>
        )}
        {meds && meds.length === 0 && (
          <div className="mt-6 rounded-3xl border border-line bg-white p-8 text-center shadow-card">
            <Pill className="mx-auto h-12 w-12 text-brand-400" />
            <p className="mt-3 text-[24px] font-bold text-ink">Aucun traitement en cours.</p>
            <p className="mt-1 text-[20px] text-ink-soft">Votre aidant peut en ajouter depuis son espace.</p>
          </div>
        )}

        {meds && meds.length > 0 && (
          <ul className="mt-6 space-y-4">
            {meds.map((m) => (
              <li key={m.id} className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ok-50 text-ok-700">
                    <Pill className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[26px] font-black leading-tight text-ink">
                      {m.name} {m.dosage && <span className="font-extrabold text-ink-soft">{m.dosage}</span>}
                    </h2>
                    {m.posology && <p className="mt-0.5 text-[20px] text-ink">{m.posology}</p>}
                    {m.instructions && (
                      <p className="mt-1 flex items-center gap-2 text-[20px] font-semibold text-brand-800">
                        <Info className="h-5 w-5 shrink-0" aria-hidden="true" /> {m.instructions}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="mt-4 space-y-2" aria-label={`Prises de ${m.name} aujourd'hui`}>
                  {(m.today.length ? m.today : m.times.map((t) => ({ id: t, time: t, at: "", status: "a_venir" as const }))).map((t) => {
                    const at = t.at ? new Date(t.at).getTime() : Infinity;
                    // Comme dans l'agenda : confirmable 30 min avant l'heure, ou en retard
                    const canConfirm = t.at !== "" && t.status !== "confirme" && at <= now + 30 * 60000;
                    return (
                      <li key={t.id} className={cx("flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3", canConfirm ? "bg-brand-50 ring-2 ring-brand-200" : "bg-canvas")}>
                        <span className="w-24 text-[26px] font-black text-ink">{t.time.replace(":", "h")}</span>
                        <span className="min-w-0 flex-1" />
                        {t.status === "confirme" && (
                          <span className="flex items-center gap-1.5 rounded-2xl bg-ok-50 px-4 py-2 text-[20px] font-extrabold text-ok-700">
                            <Check className="h-6 w-6" strokeWidth={3} /> Pris
                          </span>
                        )}
                        {canConfirm && (
                          <button
                            onClick={() => confirm(t.id)}
                            disabled={busyId === t.id}
                            className="flex min-h-16 items-center gap-2 rounded-2xl bg-ok-700 px-5 text-[22px] font-extrabold text-white hover:brightness-90 disabled:opacity-60"
                          >
                            {busyId === t.id ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" strokeWidth={3} />} Je l&apos;ai pris
                          </button>
                        )}
                        {!canConfirm && t.status !== "confirme" && (
                          <span className="flex items-center gap-1.5 rounded-2xl bg-white px-4 py-2 text-[20px] font-extrabold text-brand-800">
                            <Clock className="h-6 w-6" /> À venir
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
