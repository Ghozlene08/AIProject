"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Pill, Clock } from "lucide-react";
import { API_URL, tokenStore } from "@/lib/api";

type Medication = { _id: string; name: string; dosage?: string; posology?: string; times: string[]; instructions?: string };
type Appointment = { _id: string; title: string; startAt: string; location?: string; notes?: string };
const root = API_URL.replace(/\/+$/, "");
const base = `${root.endsWith("/api") ? root : `${root}/api`}/senior/assistant`;

export function SeniorRecords({ kind }: { kind: "medications" | "agenda" }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [events, setEvents] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(""); setLogin(false);
      const token = tokenStore.get();
      try {
        if (!token) { setLogin(true); throw new Error("Connectez-vous comme Senior pour consulter vos informations."); }
        const response = await fetch(`${base}/${kind}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (response.status === 401) setLogin(true);
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || "Impossible de charger vos informations."); }
        const data = await response.json();
        if (!controller.signal.aborted) { setMedications(data.medications || []); setEvents(data.events || []); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Le serveur est injoignable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [kind, attempt]);
  const isMedication = kind === "medications";
  return <section className="space-y-6 text-[22px] leading-relaxed text-ink">
    <h1 className="flex items-center gap-4 text-[34px] font-black text-brand-900">{isMedication ? <Pill className="h-10 w-10 shrink-0" /> : <CalendarDays className="h-10 w-10 shrink-0" />}{isMedication ? "Mes médicaments" : "Mon agenda"}</h1>
    <p>{isMedication ? "Retrouvez les traitements et les horaires renseignés par votre aidant." : "Retrouvez vos prochains rendez-vous et activités."}</p>
    {loading ? <p role="status">Chargement de vos informations…</p> : error ? <div role="alert" className="space-y-4 rounded-3xl border border-red-200 bg-white p-6"><p>{error}</p>{login ? <Link href="/connexion?espace=senior" className="inline-flex min-h-16 items-center rounded-2xl bg-brand-700 px-6 font-bold text-white">Me connecter comme Senior</Link> : <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-16 rounded-2xl border-2 border-brand-800 px-6 font-bold text-brand-900">Réessayer</button>}</div> : isMedication ? medications.length ? medications.map((med) => <article key={med._id} className="space-y-4 rounded-3xl border border-brand-200 bg-white p-6 shadow-card">
      <h2 className="text-[28px] font-extrabold text-brand-900">{med.name} {med.dosage}</h2>
      {med.posology && <p>{med.posology}</p>}
      <div className="flex flex-wrap items-center gap-3"><Clock className="h-7 w-7" aria-hidden="true" /><span className="font-bold">Chaque jour à</span>{med.times.map((time) => <span key={time} className="rounded-xl bg-brand-50 px-4 py-2 font-extrabold text-brand-900">{time}</span>)}</div>
      {med.instructions && <p className="border-t border-line pt-4">{med.instructions}</p>}
    </article>) : <p className="rounded-3xl bg-white p-6">Aucun traitement actif n’a été renseigné. Votre aidant peut ajouter vos médicaments et leurs horaires.</p> : events.length ? events.map((event) => <article key={event._id} className="space-y-3 rounded-3xl border border-brand-200 bg-white p-6 shadow-card"><h2 className="text-[28px] font-extrabold text-brand-900">{event.title}</h2><p className="font-bold">{new Date(event.startAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}</p>{event.location && <p>Lieu : {event.location}</p>}{event.notes && <p>{event.notes}</p>}</article>) : <p className="rounded-3xl bg-white p-6">Aucun rendez-vous à venir n’a été renseigné.</p>}
    {isMedication && <p className="rounded-2xl bg-brand-50 p-5">Pour ajouter ou modifier un horaire de rappel, contactez votre aidant.</p>}
    <Link href="/senior/messages" className="inline-flex min-h-16 items-center rounded-2xl bg-brand-700 px-6 py-3 font-bold text-white">Parler à mon assistant dans Messages</Link>
  </section>;
}
