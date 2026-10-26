"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  BellRing,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  LogOut,
  MapPin,
  Mic,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
  Utensils,
  Volume2,
  X,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cx } from "@/components/ui";
import { speak, stopSpeaking } from "@/components/senior/voice";
import { type AgendaItem, type Reminder, SeniorApiError, seniorApi, seniorToken } from "@/lib/seniorApi";
import { VoiceAssistant } from "./VoiceAssistant";

/* ---------- Session du senior ---------- */

export const subscribe = (cb: () => void) => {
  window.addEventListener("sa:senior-logout", cb);
  window.addEventListener("sa:senior-login", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("sa:senior-logout", cb);
    window.removeEventListener("sa:senior-login", cb);
    window.removeEventListener("storage", cb);
  };
};

export function SeniorAgendaApp() {
  // Côté serveur : « pending » (rien n'est affiché avant de connaître la session)
  const token = useSyncExternalStore(subscribe, () => seniorToken.get() ?? "", () => "pending");
  if (token === "pending") return <div className="min-h-screen bg-canvas" />;
  return token ? <AgendaScreen /> : <FaceLoginRequired />;
}

/* ---------- Pas de session : connexion par reconnaissance faciale ---------- */

export function FaceLoginRequired({ what = "votre agenda" }: { what?: string }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-b from-brand-50 to-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-line bg-white p-8 text-center shadow-pop">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-[32px] font-black text-brand-900">Bonjour !</h1>
        <p className="mt-2 text-[22px] leading-snug text-ink">Pour voir {what}, connectez-vous simplement avec votre visage.</p>
        <Link
          href="/connexion?espace=senior"
          className="mt-8 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-800 px-4 py-3 text-[24px] leading-tight font-extrabold text-white hover:bg-brand-900"
        >
          <Camera className="h-7 w-7 shrink-0" /> Me connecter avec mon visage
        </Link>
      </div>
    </main>
  );
}

/* ---------- Chargement des données ---------- */

function useSeniorData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await seniorApi.get<T>(path);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [path, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

// Heure courante, rafraîchie toutes les 30 s (statuts « à prendre maintenant », « passé »)
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + n));
};
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ---------- Écran « Mon agenda » ---------- */

interface AgendaResponse {
  date: string;
  label: string;
  items: AgendaItem[];
  speech: string;
}

function AgendaScreen() {
  const [day, setDay] = useState(() => isoOf(new Date()));
  const { data, error, reload } = useSeniorData<AgendaResponse>(`/agenda?date=${day}`);
  const me = useSeniorData<{ senior: { firstName: string; lastName: string } }>("/me");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = useNow();
  const today = isoOf(new Date(now));
  const label = data?.date === today ? "Aujourd'hui" : data?.date === shiftDay(today, 1) ? "Demain" : data?.date === shiftDay(today, -1) ? "Hier" : null;

  async function playBriefing() {
    setBriefingLoading(true);
    try {
      const res = await seniorApi.get<{ text: string }>("/briefing");
      // Voix naturelle : le briefing n'est pas un échange, quelques secondes de préparation sont acceptables
      await speak(res.text, { natural: true });
      setBriefingLoading(false);
    } catch {
      setBriefingLoading(false);
    }
  }

  async function confirmIntake(id: string) {
    setBusyId(id);
    try {
      const res = await seniorApi.post<{ speech: string }>(`/intakes/${id}/confirm`, { channel: "ecran" });
      reload();
      speak(res.speech);
    } finally {
      setBusyId(null);
    }
  }

  // Suppression sans boîte de dialogue : le rappel disparaît tout de suite et peut être
  // rétabli pendant 8 secondes avec un grand bouton « Annuler » (moins anxiogène, plus lisible)
  const [removing, setRemoving] = useState<AgendaItem | null>(null);
  const removeTimer = useRef<number | undefined>(undefined);
  const commitRemoval = useCallback(
    async (item: AgendaItem) => {
      window.clearTimeout(removeTimer.current);
      setRemoving(null);
      await seniorApi.del(`/events/${item.id}`).catch(() => {});
      reload();
    },
    [reload],
  );

  function cancelEvent(item: AgendaItem) {
    if (removing) commitRemoval(removing);
    setRemoving(item);
    speak("Rappel supprimé. Vous pouvez encore l'annuler.");
    removeTimer.current = window.setTimeout(() => commitRemoval(item), 8000);
  }

  function undoRemoval() {
    window.clearTimeout(removeTimer.current);
    setRemoving(null);
    speak("C'est annulé, le rappel est conservé.");
  }

  // En quittant la page, une suppression en attente est appliquée
  const removingRef = useRef<AgendaItem | null>(null);
  useEffect(() => {
    removingRef.current = removing;
  }, [removing]);
  useEffect(
    () => () => {
      if (removingRef.current) seniorApi.del(`/events/${removingRef.current.id}`).catch(() => {});
    },
    [],
  );

  function logout() {
    stopSpeaking();
    seniorToken.clear();
    window.dispatchEvent(new Event("sa:senior-logout"));
  }

  const name = me.data ? `${me.data.senior.firstName} ${me.data.senior.lastName}` : "";

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-line bg-white px-4 sm:px-8">
        <Link href="/senior/connexion-reussie#accueil" className="flex min-h-14 items-center gap-2.5 rounded-2xl pr-3" aria-label="Revenir à l'accueil">
          <ChevronLeft className="h-7 w-7 text-brand-800" />
          <LogoMark className="h-9 w-9" />
          <span className="hidden text-xl font-extrabold tracking-tight text-brand-900 sm:inline">Accueil</span>
        </Link>
        <div className="flex items-center gap-3">
          {name && <span className="hidden text-lg font-bold text-ink sm:block">{name}</span>}
          <button onClick={logout} className="flex min-h-14 items-center gap-2 rounded-2xl px-4 text-lg font-bold text-danger-700 hover:bg-danger-50">
            <LogOut className="h-6 w-6" /> <span className="hidden sm:inline">Quitter</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-44 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[36px] font-black tracking-tight text-brand-900">Mon agenda</h1>
            <p className="mt-1 text-[24px] font-semibold text-ink">
              {label ? `${label}, ` : ""}
              {data ? (label ? longDate(data.date).toLowerCase() : longDate(data.date)) : "…"}
            </p>
          </div>
          <button
            onClick={playBriefing}
            disabled={briefingLoading}
            className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-brand-200 bg-white px-5 text-[20px] font-extrabold text-brand-800 hover:bg-brand-50 disabled:opacity-60"
          >
            {briefingLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Volume2 className="h-7 w-7" />} Écouter mon programme
          </button>
        </div>

        {/* Choix du jour : aujourd'hui ou demain (les autres jours se demandent à la voix :
            « Qu'ai-je prévu jeudi ? ») — moins de boutons, moins d'hésitation */}
        <div role="group" aria-label="Jour affiché" className="mt-6 grid grid-cols-2 gap-2 rounded-3xl bg-white p-2 shadow-card">
          {[
            { iso: today, text: "Aujourd'hui" },
            { iso: shiftDay(today, 1), text: "Demain" },
          ].map((d) => (
            <button
              key={d.text}
              onClick={() => setDay(d.iso)}
              aria-pressed={day === d.iso}
              className={cx(
                "min-h-16 rounded-2xl text-[22px] font-extrabold transition-colors",
                day === d.iso ? "bg-brand-800 text-white" : "text-ink hover:bg-brand-50",
              )}
            >
              {d.text}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 rounded-2xl bg-danger-50 p-5 text-[22px] font-bold text-danger-700">{error}</p>}
        {!data && !error && (
          <p className="mt-10 flex items-center justify-center gap-3 text-[22px] text-ink-soft">
            <Loader2 className="h-7 w-7 animate-spin" /> Chargement…
          </p>
        )}
        {data && data.items.length === 0 && (
          <div className="mt-6 rounded-3xl border border-line bg-white p-8 text-center shadow-card">
            <CalendarDays className="mx-auto h-12 w-12 text-brand-400" />
            <p className="mt-3 text-[24px] font-bold text-ink">Rien de prévu ce jour-là.</p>
          </div>
        )}
        {data && data.items.length > 0 && (
          <ul className="mt-6 space-y-4">
            {data.items.filter((it) => it.id !== removing?.id).map((it) => (
              <AgendaRow key={it.kind + it.id} item={it} now={now} busy={busyId === it.id} onConfirm={() => confirmIntake(it.id)} onCancel={() => cancelEvent(it)} />
            ))}
          </ul>
        )}
      </main>

      {/* Annulation d'une suppression (8 secondes) */}
      {removing && (
        <div role="status" className="fixed inset-x-0 bottom-32 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center gap-4 rounded-3xl bg-ink px-6 py-4 text-white shadow-pop">
          <p className="min-w-0 flex-1 text-[22px] font-bold">Rappel « {removing.title} » supprimé</p>
          <button onClick={undoRemoval} className="min-h-16 rounded-2xl bg-white px-6 text-[22px] font-extrabold text-brand-900 hover:bg-brand-50">
            Annuler
          </button>
        </div>
      )}

      {/* Actions principales : la voix d'abord */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3 px-4 py-4 sm:px-6">
          <button
            onClick={() => setVoiceOpen(true)}
            className="flex min-h-20 flex-1 items-center justify-center gap-3 rounded-3xl bg-brand-800 px-4 text-[24px] font-extrabold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-900"
          >
            <Mic className="h-8 w-8" /> Créer un rappel à la voix
          </button>
          <button onClick={() => setAdding(true)} className="flex min-h-20 w-20 shrink-0 items-center justify-center rounded-3xl border-2 border-brand-200 bg-white text-brand-800 hover:bg-brand-50" aria-label="Ajouter un rappel à l'écran">
            <Plus className="h-9 w-9" />
          </button>
        </div>
      </div>

      {voiceOpen && (
        <VoiceAssistant
          onClose={() => {
            setVoiceOpen(false);
            reload();
          }}
          onAgendaChange={reload}
        />
      )}
      {adding && (
        <AddReminder
          defaultDate={day}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      <ReminderWatcher onChange={reload} paused={voiceOpen} />
    </div>
  );
}

/* ---------- Ligne de l'agenda ---------- */

const EVENT_ICON = { rdv: Stethoscope, repas: Utensils, activite: Activity, rappel: BellRing, autre: CalendarDays } as const;

function AgendaRow({ item, now, busy, onConfirm, onCancel }: { item: AgendaItem; now: number; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const isPrise = item.kind === "prise";
  const Icon = isPrise ? Pill : EVENT_ICON[item.type ?? "autre"];
  const at = new Date(item.at).getTime();
  const due = isPrise && item.status === "a_venir" && at <= now + 30 * 60000;
  const past = !isPrise && at < now;

  return (
    <li className={cx("flex flex-wrap items-center gap-4 rounded-3xl border bg-white p-5 shadow-card", due ? "border-brand-300 ring-2 ring-brand-200" : "border-line")}>
      <span className="w-[5.5rem] text-[28px] font-black text-ink">{item.time.replace(":", "h")}</span>
      <span className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", isPrise ? "bg-ok-50 text-ok-700" : item.type === "rdv" ? "bg-brand-50 text-brand-800" : "bg-warn-50 text-warn-700")}>
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[22px] font-extrabold leading-tight text-ink">{isPrise ? item.detail : item.title}</p>
        {(isPrise ? item.note : item.detail) && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[19px] text-ink-soft">
            {!isPrise && <MapPin className="h-5 w-5 shrink-0" />}
            {isPrise ? item.note : item.detail}
          </p>
        )}
        {item.createdBy === "senior" && <p className="mt-0.5 text-[17px] font-semibold text-brand-800">Ajouté par vous</p>}
      </div>
      {isPrise && item.status === "confirme" && <Status tone="ok" icon={<Check className="h-6 w-6" strokeWidth={3} />} label="Pris" />}
      {isPrise && item.status === "manque" && <Status tone="warn" icon={<Clock className="h-6 w-6" />} label="Non confirmé" />}
      {due && (
        <button onClick={onConfirm} disabled={busy} className="flex min-h-16 items-center gap-2 rounded-2xl bg-ok-700 px-5 text-[22px] font-extrabold text-white hover:brightness-90 disabled:opacity-60">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" strokeWidth={3} />} Je l&apos;ai pris
        </button>
      )}
      {isPrise && item.status === "a_venir" && !due && <Status tone="brand" icon={<Clock className="h-6 w-6" />} label="À venir" />}
      {!isPrise && (item.status === "fait" || past) && <Status tone="muted" icon={<Check className="h-6 w-6" />} label="Passé" />}
      {!isPrise && !past && item.status === "prevu" && item.createdBy !== "senior" && <Status tone="brand" icon={<Clock className="h-6 w-6" />} label="À venir" />}
      {!isPrise && !past && item.createdBy === "senior" && (
        <button onClick={onCancel} className="flex min-h-16 items-center gap-2 rounded-2xl px-4 text-[20px] font-bold text-ink-soft hover:bg-danger-50 hover:text-danger-700" aria-label={`Supprimer le rappel ${item.title}`}>
          <Trash2 className="h-6 w-6" /> Supprimer
        </button>
      )}
    </li>
  );
}

function Status({ tone, icon, label }: { tone: "ok" | "warn" | "brand" | "muted"; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 rounded-2xl px-4 py-2 text-[20px] font-extrabold",
        tone === "ok" && "bg-ok-50 text-ok-700",
        tone === "warn" && "bg-warn-50 text-warn-700",
        tone === "brand" && "bg-brand-50 text-brand-800",
        tone === "muted" && "bg-slate-100 text-slate-700",
      )}
    >
      {icon} {label}
    </span>
  );
}

/* ---------- Ajout d'un rappel à l'écran ---------- */

function AddReminder({ defaultDate, onClose, onSaved }: { defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await seniorApi.post<{ duplicate?: boolean }>("/events", { title, date, time, type: "rappel" });
      speak(res.duplicate ? `Ce rappel est déjà dans votre agenda : ${title}.` : `C'est noté : ${title}.`);
      onSaved();
    } catch (err) {
      setError(err instanceof SeniorApiError ? err.message : "Impossible d'enregistrer le rappel.");
      setSaving(false);
    }
  }

  const field = "mt-2 h-16 w-full rounded-2xl border-2 border-line px-4 text-[24px] text-ink focus:border-brand-400 focus:outline-none";
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-brand-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ajouter un rappel">
      <form onSubmit={save} className="w-full max-w-lg rounded-t-[28px] bg-white p-6 shadow-pop sm:rounded-[28px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-black text-brand-900">Nouveau rappel</h2>
          <button type="button" onClick={onClose} className="flex h-16 w-16 items-center justify-center rounded-2xl text-ink-soft hover:bg-canvas" aria-label="Fermer">
            <X className="h-8 w-8" />
          </button>
        </div>
        <label className="mt-4 block text-[22px] font-bold text-ink">
          Que dois-je vous rappeler ?
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="Appeler ma fille" className={field} />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-[22px] font-bold text-ink">
            Quel jour ?
            <input type="date" value={date} min={isoOf(new Date())} onChange={(e) => setDate(e.target.value)} required className={field} />
          </label>
          <label className="block text-[22px] font-bold text-ink">
            À quelle heure ?
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={field} />
          </label>
        </div>
        {error && <p className="mt-4 rounded-2xl bg-danger-50 p-4 text-[20px] font-bold text-danger-700">{error}</p>}
        <button disabled={saving} className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-800 text-[24px] font-extrabold text-white hover:bg-brand-900 disabled:opacity-60">
          {saving ? <Loader2 className="h-7 w-7 animate-spin" /> : <Check className="h-7 w-7" strokeWidth={3} />} Enregistrer le rappel
        </button>
      </form>
    </div>
  );
}

/* ---------- Rappels proactifs : vérification toutes les 30 secondes ---------- */

const SNOOZE_MS = 10 * 60 * 1000; // « Plus tard » : le rappel revient 10 minutes après
const REPEAT_MS = 2 * 60 * 1000; // sans réponse, le rappel est relu toutes les 2 minutes

function ReminderWatcher({ onChange, paused }: { onChange: () => void; paused: boolean }) {
  const [queue, setQueue] = useState<Reminder[]>([]);
  // Rappel traité → masqué définitivement ; « Plus tard » → masqué jusqu'à l'heure indiquée
  const hiddenUntil = useRef(new Map<string, number>());
  const current = paused ? null : queue[0];

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await seniorApi.get<{ reminders: Reminder[] }>("/reminders/due");
        const now = Date.now();
        if (!cancelled) setQueue(res.reminders.filter((r) => (hiddenUntil.current.get(r.id) ?? 0) < now));
      } catch {}
    };
    check();
    const t = window.setInterval(check, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Le rappel est lu à voix haute dès qu'il s'affiche, puis relu tant qu'il reste sans réponse
  useEffect(() => {
    if (!current) return;
    speak(current.speech, { natural: true });
    // Les relectures utilisent la voix du navigateur : le quota gratuit de la voix naturelle est limité
    const t = window.setInterval(() => speak(current.speech), REPEAT_MS);
    return () => window.clearInterval(t);
  }, [current]);

  if (!current) return null;

  const close = () => {
    hiddenUntil.current.set(current.id, Date.now() + SNOOZE_MS);
    setQueue((q) => q.slice(1));
    stopSpeaking();
    speak("D'accord, je vous le rappellerai dans 10 minutes.");
  };

  async function act() {
    if (!current) return;
    try {
      if (current.kind === "prise") {
        const res = await seniorApi.post<{ speech: string }>(`/intakes/${current.id}/confirm`, { channel: "ecran" });
        speak(res.speech);
      } else {
        await seniorApi.post(`/events/${current.id}/ack`);
      }
    } finally {
      hiddenUntil.current.set(current.id, Number.POSITIVE_INFINITY);
      setQueue((q) => q.slice(1));
      onChange();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="rappel-titre">
      <div className="fade-up w-full max-w-lg rounded-[32px] bg-white p-8 text-center shadow-pop">
        <span className="pulse-ring relative mx-auto flex h-24 w-24 items-center justify-center rounded-full text-brand-200">
          <span className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-brand-800 text-white">
            {current.kind === "prise" ? <Pill className="h-12 w-12" /> : <BellRing className="h-12 w-12" />}
          </span>
        </span>
        <p className="mt-6 text-[22px] font-bold text-ink-soft">{current.time.replace(":", "h")}</p>
        <h2 id="rappel-titre" className="text-[32px] font-black leading-tight text-brand-900">
          {current.title}
        </h2>
        <p className="mt-2 text-[26px] font-bold text-ink">{current.detail}</p>
        <div className="mt-8 grid gap-3">
          <button onClick={act} className="flex min-h-20 items-center justify-center gap-3 rounded-3xl bg-ok-700 text-[26px] font-extrabold text-white hover:brightness-90">
            <Check className="h-8 w-8" strokeWidth={3} /> {current.kind === "prise" ? "Je l'ai pris" : "C'est noté"}
          </button>
          <button onClick={close} className="min-h-16 rounded-3xl text-[22px] font-bold text-ink-soft hover:bg-canvas">
            Plus tard (dans 10 minutes)
          </button>
        </div>
      </div>
    </div>
  );
}
