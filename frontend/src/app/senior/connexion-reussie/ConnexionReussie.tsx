"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Heart,
  Home,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  Phone,
  PhoneCall,
  PhoneOff,
  Pill,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cx } from "@/components/ui";
import { useRouter } from "next/navigation";
import { clearSeniorSession } from "@/lib/senior/api";
import { disconnectSocket } from "@/lib/socket";
import { useCaregiverCall } from "@/lib/useCaregiverCall";
import { formatDuration } from "@/lib/rtc";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const CHECKIN_POLL_MS = 10_000;
const CHECKIN_RING_MS = 8_000; // le son du check-in se répète toutes les 8 secondes

/* ---------- Sons d'alerte (générés par le navigateur, aucun fichier audio) ---------- */

type SoundKind = "alert" | "success" | "error";

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/** Débloque le son (les navigateurs l'exigent après un geste de l'utilisateur). */
function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, volume = 0.4) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + start;

  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Joue un son. Retourne false si le navigateur bloque encore l'audio. */
async function playSound(kind: SoundKind): Promise<boolean> {
  const ctx = getAudioCtx();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return false;
  }
  if (ctx.state !== "running") return false;

  if (kind === "alert") {
    // Ding-dong-ding-dong, bien audible
    tone(ctx, 880, 0.0, 0.3);
    tone(ctx, 660, 0.35, 0.3);
    tone(ctx, 880, 0.7, 0.3);
    tone(ctx, 660, 1.05, 0.3);
  } else if (kind === "success") {
    // Petit carillon montant
    tone(ctx, 660, 0.0, 0.25);
    tone(ctx, 880, 0.22, 0.4);
  } else {
    // Deux sons graves
    tone(ctx, 300, 0.0, 0.3, 0.45);
    tone(ctx, 300, 0.4, 0.3, 0.45);
  }
  return true;
}

function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* voix indisponible : le son seul suffit */
  }
}

function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/* ---------- Données fictives (à remplacer par l'API lors du branchement) ---------- */

export interface SeniorAccueilData {
  firstName: string;
  lastName: string;
  /** Photo enregistrée par l'aidant (URL ou data URL de la caméra) */
  photoUrl?: string;
  prochainePrise: { medicament: string; heure: string } | null;
}

const DEMO: SeniorAccueilData = {
  firstName: "Marie",
  lastName: "Dupont",
  prochainePrise: { medicament: "Paracétamol 1 g", heure: "08:30" },
};

/* Contacts à appeler (à remplacer par les vrais contacts du senior) */
type CallContact = { name: string; relation: string; phone: string };

const CONTACTS: CallContact[] = [
  { name: "Mon aidant", relation: "Aidant", phone: "+21600000000" },
  { name: "Mon médecin", relation: "Médecin", phone: "+21600000001" },
  { name: "Urgences", relation: "Secours", phone: "190" },
];

const REDIRECT_MS = 3000;

/**
 * Étape 4 du parcours de connexion du senior :
 * 1) carte « Visage reconnu avec succès » avec barre de progression,
 * 2) puis l'accueil du senior (assistant vocal + raccourcis).
 */
export function ConnexionReussie({ data = DEMO, redirectMs = REDIRECT_MS }: { data?: SeniorAccueilData; redirectMs?: number }) {
  // "init" : un instant, le temps de savoir s'il faut montrer la carte de succès ou directement l'accueil
  const [phase, setPhase] = useState<"init" | "succes" | "accueil">("init");
  const [progress, setProgress] = useState(0);
const [firstName, setFirstName] = useState(data.firstName);
const [lastName, setLastName] = useState(data.lastName);
const [photoUrl, setPhotoUrl] = useState(data.photoUrl);

useEffect(() => {
  const storedFirstName = localStorage.getItem("seniorFirstName");
   const storedLastName = localStorage.getItem("seniorLastName");
   const storedPhotoUrl = localStorage.getItem("seniorPhotoUrl");

  if (storedFirstName) {
    setFirstName(storedFirstName);
  }
    if (storedLastName) {
    setLastName(storedLastName);
  }
  if (storedPhotoUrl) {
  setPhotoUrl(`http://localhost:5000${storedPhotoUrl}`);
}
}, []);
  useEffect(() => {
    // Retour depuis une autre page Senior (Souvenirs…) avec ?vue=accueil :
    // directement le tableau de bord, sans rejouer « Visage reconnu avec succès »
    if (new URLSearchParams(window.location.search).get("vue") === "accueil") {
      const show = window.setTimeout(() => setPhase("accueil"), 0);
      return () => window.clearTimeout(show);
    }
    const first = window.setTimeout(() => setPhase("succes"), 0);
    const start = window.setTimeout(() => setProgress(100), 50);
    const done = window.setTimeout(() => setPhase("accueil"), redirectMs);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(start);
      window.clearTimeout(done);
    };
  }, [redirectMs]);
const connectedSenior = {
  ...data,
  firstName,
  lastName,
   photoUrl,
};
  if (phase === "init") return <div className="min-h-screen flex-1 bg-canvas" />;
  return phase === "succes"
  ? <SuccesCard
      data={connectedSenior}
      progress={progress}
      durationMs={redirectMs}
    />
  : <SeniorAccueil data={connectedSenior} />;
}

/* ---------- 1. Carte de succès ---------- */

function SuccesCard({ data, progress, durationMs }: { data: SeniorAccueilData; progress: number; durationMs: number }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-b from-brand-50 to-canvas px-4 py-10">
      <section aria-live="polite" className="fade-up w-full max-w-md rounded-[28px] border border-line bg-white px-8 py-10 text-center shadow-pop">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-ok-500 text-white shadow-lg shadow-ok-500/30">
          <Check className="h-11 w-11" strokeWidth={3} aria-hidden="true" />
        </span>

        <h1 className="mt-6 text-[34px] font-black tracking-tight text-brand-900">Bonjour {data.firstName} !</h1>
        <p className="mt-1 text-[22px] font-semibold text-ok-600">Visage reconnu avec succès.</p>

        <div className="mx-auto mt-7 w-fit rounded-full bg-brand-50 p-2.5">
          <Portrait data={data} className="h-36 w-36" />
        </div>

        <p className="mt-7 text-[22px] leading-snug text-ink">
          Ouverture de votre espace…
          <br />
          Redirection en cours…
        </p>

        <div
          className="mt-5 h-3 w-full overflow-hidden rounded-full bg-brand-100"
          role="progressbar"
          aria-label="Ouverture de votre espace"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-brand-600 ease-linear motion-safe:transition-[width]"
            style={{ width: `${progress}%`, transitionDuration: `${durationMs - 100}ms` }}
          />
        </div>
      </section>
    </main>
  );
}

function Portrait({ data, className }: { data: SeniorAccueilData; className?: string }) {
  if (data.photoUrl) {
    // Photo issue de la caméra (data URL) : balise img volontaire, pas d'optimisation Next nécessaire
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={data.photoUrl} alt={`${data.firstName} ${data.lastName}`} className={cx("rounded-full object-cover", className)} />;
  }
  return (
    <span className={cx("flex items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700", className)} role="img" aria-label={`${data.firstName} ${data.lastName}`}>
      <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
    </span>
  );
}

/* ---------- 2. Accueil du senior ---------- */

// SOS n'est plus dans le menu : il est accessible par la grande barre « Appel d'urgence »
const NAV: { label: string; icon: LucideIcon }[] = [
  { label: "Accueil", icon: Home },
  { label: "Agenda", icon: CalendarDays },
  { label: "Médicaments", icon: Pill },
  { label: "Documents", icon: FileText },
  { label: "Souvenirs", icon: Heart },
  { label: "Proches", icon: Users },
  { label: "Messages", icon: MessageSquare },
  { label: "Paramètres", icon: Settings },
];

// Barre du bas (mobile), comme sur la maquette
const MOBILE_NAV: { label: string; icon: LucideIcon }[] = [
  { label: "Accueil", icon: Home },
  { label: "Agenda", icon: CalendarDays },
  { label: "Médicaments", icon: Pill },
  { label: "Souvenirs", icon: Heart },
  { label: "Plus", icon: LayoutGrid },
];

// Raccourcis : non reliés pour l'instant (le routage sera ajouté par l'équipe)
const SHORTCUTS: { label: string; icon: LucideIcon; cardCls: string; iconCls: string }[] = [
  { label: "Mon agenda", icon: CalendarDays, cardCls: "bg-brand-50 border-brand-100", iconCls: "bg-brand-600 text-white" },
  { label: "Mes médicaments", icon: Pill, cardCls: "bg-teal-50 border-teal-100", iconCls: "bg-teal-500 text-white" },
  // F3 « Photo → Compris » : photographier un courrier ou une ordonnance, explication lue à voix haute
  { label: "Mes documents", icon: FileText, cardCls: "bg-violet-50 border-violet-500/15", iconCls: "bg-violet-500 text-white" },
  { label: "Mes proches", icon: Users, cardCls: "bg-brand-50 border-brand-100", iconCls: "bg-brand-700 text-white" },
];

type SosState = "idle" | "confirm" | "sending" | "sent" | "error";

type PendingCheckIn = {
  id: string;
  title: string;
  message: string;
  /** Moment local où le check-in expire */
  expiresAt: number;
};

function SeniorAccueil({ data }: { data: SeniorAccueilData }) {
  const [listening, setListening] = useState(false);
  const [priseConfirmee, setPriseConfirmee] = useState(false);
  const [sosState, setSosState] = useState<SosState>("idle");
  const [sosError, setSosError] = useState("");

  // Fenêtre « Mes proches » (liste de contacts téléphoniques)
  const [callOpen, setCallOpen] = useState(false);

  // Appel vocal vers l'aidant (WebRTC)
  const call = useCaregiverCall();

  // Check-in « Êtes-vous en sécurité ? »
  const [checkIn, setCheckIn] = useState<PendingCheckIn | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [checkInSending, setCheckInSending] = useState(false);
  const [checkInError, setCheckInError] = useState("");
  const [soundBlocked, setSoundBlocked] = useState(false);
  const respondingRef = useRef(false);

  const router = useRouter();
  // Menu sous le nom du senior (en haut à droite) : « Se déconnecter »
  const [menuOpen, setMenuOpen] = useState(false);

  // Déconnexion : efface la session du senior, coupe le socket des appels, retour à la connexion senior
  function logout() {
    clearSeniorSession();
    disconnectSocket();
    router.replace("/connexion?espace=senior");
  }

  /* ----- Son : le premier geste de l'utilisateur débloque l'audio du navigateur ----- */
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  /* ----- Fermer la fenêtre de contacts avec Échap ----- */
  useEffect(() => {
    if (!callOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCallOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [callOpen]);

  /* ----- SOS ----- */
  async function sendSos() {
    if (sosState === "sending") return;

    setSosState("sending");
    setSosError("");

    try {
      // Le senior est identifié uniquement par son seniorId (localStorage)
      const seniorId = localStorage.getItem("seniorId");

      if (!seniorId) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      const response = await fetch(`${API_URL}/api/senior/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok) {
        console.error("SOS failed:", response.status, result);
        throw new Error(result?.message || `Impossible d'envoyer l'alerte (erreur ${response.status}).`);
      }

      setSosState("sent");
    } catch (error) {
      console.error("SOS error:", error);
      setSosError(error instanceof Error ? error.message : "Impossible d'envoyer l'alerte.");
      setSosState("error");
    }
  }

  /* ----- Son du résultat SOS : carillon si envoyé, sons graves si échec ----- */
  useEffect(() => {
    if (sosState === "sent") {
      void playSound("success");
      vibrate([200]);
    } else if (sosState === "error") {
      void playSound("error");
      vibrate([400, 150, 400]);
    }
  }, [sosState]);

  /* ----- Check-in : interrogation régulière du backend ----- */
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (respondingRef.current) return;

      const seniorId = localStorage.getItem("seniorId");
      if (!seniorId) return;

      try {
        const response = await fetch(
          `${API_URL}/api/senior/check-in/pending?seniorId=${encodeURIComponent(seniorId)}`,
          { cache: "no-store" }
        );
        if (!response.ok) return;

        const result = await response.json();
        if (cancelled || respondingRef.current) return;

        if (result?.checkIn) {
          const c = result.checkIn;
          setCheckIn((prev) =>
            prev?.id === c._id
              ? prev
              : {
                  id: c._id,
                  title: c.title,
                  message: c.message,
                  expiresAt: Date.now() + Number(c.remainingMs || 0),
                }
          );
        } else {
          // Plus de check-in en attente (répondu depuis ailleurs ou expiré)
          setCheckIn(null);
        }
      } catch (error) {
        console.error("Check-in poll error:", error);
      }
    }

    poll();
    const timer = window.setInterval(poll, CHECKIN_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Compte à rebours
  useEffect(() => {
    if (!checkIn) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((checkIn.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setCheckIn(null); // délai écoulé : le backend alerte l'aidant
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [checkIn]);

  /* ----- Son du check-in : se répète tant que la fenêtre est visible ----- */
  const checkInId = checkIn?.id;
  const checkInSpeech = checkIn ? `${checkIn.title}. ${checkIn.message}` : "";
  const checkInVisible = Boolean(checkIn) && sosState === "idle";

  useEffect(() => {
    if (!checkInId || !checkInVisible) return;

    let stopped = false;

    const ring = async () => {
      if (stopped) return;
      const ok = await playSound("alert");
      if (stopped) return;
      setSoundBlocked(!ok);
      if (ok) {
        vibrate([300, 150, 300]);
        speak(checkInSpeech);
      }
    };

    void ring();
    const timer = window.setInterval(ring, CHECKIN_RING_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      stopSpeaking();
      setSoundBlocked(false);
    };
    // checkInSpeech n'est volontairement pas une dépendance : seule la présence du check-in compte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInId, checkInVisible]);

  async function enableSound() {
    unlockAudio();
    const ok = await playSound("alert");
    setSoundBlocked(!ok);
    if (ok) speak(checkInSpeech);
  }

  async function confirmCheckIn() {
    if (!checkIn || respondingRef.current) return;

    respondingRef.current = true;
    setCheckInSending(true);
    setCheckInError("");

    try {
      const seniorId = localStorage.getItem("seniorId");
      if (!seniorId) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      const response = await fetch(`${API_URL}/api/senior/check-in/${checkIn.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniorId }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      // 404 = déjà traité ou expiré : on ferme la fenêtre dans tous les cas
      if (!response.ok && response.status !== 404) {
        console.error("Check-in response failed:", response.status, result);
        throw new Error(result?.message || `Impossible d'envoyer votre réponse (erreur ${response.status}).`);
      }

      setCheckIn(null);
    } catch (error) {
      console.error("Check-in error:", error);
      setCheckInError(error instanceof Error ? error.message : "Impossible d'envoyer votre réponse.");
    } finally {
      respondingRef.current = false;
      setCheckInSending(false);
    }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="fade-up flex min-h-screen flex-1 flex-col bg-canvas">
      {/* Voix de l'aidant : doit toujours rester dans le DOM */}
      <audio ref={call.audioRef} autoPlay playsInline />

      {/* En-tête */}
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-line bg-white px-4 sm:px-8">
        <span className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight text-brand-900">Senior Assistant</span>
        </span>
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Icône d'appel : appelle uniquement l'aidant */}
          <button
            type="button"
            onClick={() => call.start()}
            disabled={call.state !== "idle"}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ok-50 text-ok-600 hover:bg-ok-500 hover:text-white disabled:opacity-60"
            aria-label="Appeler mon aidant"
          >
            <Phone className="h-7 w-7" aria-hidden="true" />
          </button>
          <button type="button" className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-ink hover:bg-brand-50" aria-label="Notifications">
            <Bell className="h-7 w-7" />
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-danger-500" aria-hidden="true" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex min-h-14 items-center gap-3 rounded-2xl px-2 hover:bg-brand-50"
            >
              <Portrait data={data} className="h-11 w-11" />
              <span className="hidden text-lg font-bold text-ink sm:block">
                {data.firstName} {data.lastName}
              </span>
              <ChevronDown className={cx("hidden h-5 w-5 text-muted transition-transform sm:block", menuOpen && "rotate-180")} aria-hidden="true" />
            </button>

            {/* Menu déroulant : un fond transparent ferme le menu au clic à l'extérieur */}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div role="menu" className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-pop">
                  <p className="truncate px-4 py-3 text-lg font-bold text-ink">
                    {data.firstName} {data.lastName}
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl px-4 text-[22px] font-bold text-danger-600 hover:bg-danger-50"
                  >
                    <LogOut className="h-7 w-7" aria-hidden="true" /> Se déconnecter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Menu latéral (bureau / tablette) */}
        <nav aria-label="Menu principal" className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-white p-4 lg:flex">
          <ul className="space-y-1.5">
            {NAV.map(({ label, icon: Icon }) => {
              const active = label === "Accueil";
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => {
                      if (label === "Documents") {
                        router.push("/senior/documents");
                      }
                      // Module F4 — Souvenirs
                      if (label === "Souvenirs") {
                        router.push("/senior/souvenirs");
                      }
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-16 w-full items-center gap-4 rounded-2xl px-4 text-[20px] font-bold transition-colors",
                      active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-brand-50/60",
                    )}
                  >
                    <Icon className={cx("h-7 w-7", active ? "text-brand-600" : "text-slate-500")} aria-hidden="true" />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={logout} className="mt-auto flex min-h-16 w-full items-center gap-4 rounded-2xl px-4 text-[20px] font-bold text-danger-600 hover:bg-danger-50">
            <LogOut className="h-7 w-7" aria-hidden="true" /> Se déconnecter
          </button>
        </nav>

        {/* Contenu */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-8 sm:px-8 lg:pb-10">
          <h1 className="text-[34px] font-black tracking-tight text-brand-900 sm:text-[40px]">
            Bonjour {data.firstName},{" "}
            <span role="img" aria-label="salut">
              👋
            </span>
          </h1>
          <p className="mt-1 text-[24px] text-ink">Comment puis-je vous aider aujourd&apos;hui ?</p>

          {/* Bouton micro */}
          <div className="mt-8 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setListening((l) => !l)}
              aria-pressed={listening}
              aria-label={listening ? "Arrêter l'écoute" : "Parler à l'assistant"}
              className={cx("relative flex h-40 w-40 items-center justify-center rounded-full", listening ? "pulse-ring text-brand-300" : "")}
            >
              <span className="absolute inset-0 rounded-full bg-brand-100/70" aria-hidden="true" />
              <span className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/40 transition-transform active:scale-95">
                <Mic className="h-16 w-16" aria-hidden="true" />
              </span>
            </button>
            <p className="mt-5 text-[26px] font-extrabold text-brand-700">{listening ? "Je vous écoute…" : "Parlez maintenant"}</p>
            <p className="text-center text-[22px] text-muted">Dites votre demande, naturellement…</p>
          </div>

          {/* Raccourcis */}
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {SHORTCUTS.map(({ label, icon: Icon, iconCls, cardCls }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label === "Mes documents") {
                    router.push("/senior/documents");
                  }
                  if (label === "Mes proches") {
                    setCallOpen(true);
                  }
                }}
                className={cx("flex min-h-44 flex-col items-center justify-start gap-4 rounded-3xl border px-4 pb-5 pt-7 text-center shadow-card transition-shadow hover:shadow-pop", cardCls)}
              >
                <span className={cx("flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm", iconCls)}>
                  <Icon className="h-8 w-8" aria-hidden="true" />
                </span>
                <span className="text-[22px] font-extrabold leading-tight text-ink">{label}</span>
              </button>
            ))}
          </div>

          {/* Appel d'urgence (remplace l'entrée SOS du menu) */}
          <button
            type="button"
            onClick={() => setSosState("confirm")}
            className="mt-5 flex min-h-20 w-full items-center justify-center gap-5 rounded-3xl bg-danger-500 px-6 text-white shadow-lg shadow-danger-500/30 transition-colors hover:bg-danger-600"
          >
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-[22px] font-black uppercase leading-none">SOS</span>
            <span className="text-[26px] font-extrabold">Appel d&apos;urgence</span>
          </button>

          {/* Prochaine prise */}
          {data.prochainePrise && (
            <section aria-label="Prochaine prise" className="mt-6 flex flex-wrap items-center gap-5 rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Pill className="h-8 w-8" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-muted">Prochaine prise</p>
                <p className="text-[24px] font-extrabold text-ink">{data.prochainePrise.medicament}</p>
                <p className="mt-0.5 flex items-center gap-2 text-lg font-semibold text-ok-600">
                  <Clock className="h-5 w-5" aria-hidden="true" /> Aujourd&apos;hui à {data.prochainePrise.heure}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPriseConfirmee(true)}
                disabled={priseConfirmee}
                className={cx(
                  "flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl px-7 text-[22px] font-extrabold transition-colors sm:w-auto",
                  priseConfirmee ? "bg-ok-50 text-ok-600" : "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
                )}
              >
                {priseConfirmee ? (
                  <>
                    <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" /> Prise confirmée
                  </>
                ) : (
                  "Marquer comme prise"
                )}
              </button>
            </section>
          )}
        </main>
      </div>

      {/* Barre de navigation (mobile) */}
      <nav aria-label="Menu principal" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white lg:hidden">
        {MOBILE_NAV.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            // Module F4 — Souvenirs
            onClick={label === "Souvenirs" ? () => router.push("/senior/souvenirs") : undefined}
            aria-current={label === "Accueil" ? "page" : undefined}
            className={cx("flex min-h-20 flex-col items-center justify-center gap-1 text-sm font-bold", label === "Accueil" ? "text-brand-700" : "text-ink")}
          >
            <Icon className={cx("h-7 w-7", label === "Accueil" ? "text-brand-600" : "text-slate-500")} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Appel vocal vers l'aidant */}
      {call.state !== "idle" && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="call-status-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-pop">
            <span
              className={cx(
                "mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white",
                call.state === "ended" ? "bg-slate-400" : "bg-ok-500",
                (call.state === "calling" || call.state === "connecting") && "animate-pulse",
              )}
            >
              <Phone className="h-12 w-12" aria-hidden="true" />
            </span>

            <h2 id="call-status-title" className="mt-5 text-[28px] font-black text-brand-900">
              {call.state === "calling" && "J'appelle votre aidant…"}
              {call.state === "connecting" && "Connexion…"}
              {call.state === "active" && "En communication"}
              {call.state === "ended" && "Appel terminé"}
            </h2>
            <p className="mt-2 text-[20px] text-ink">{call.message}</p>

            {/* Chronomètre : visible pendant l'appel et sur l'écran « Appel terminé » */}
            {(call.state === "active" || (call.state === "ended" && call.seconds > 0)) && (
              <p
                className="mt-3 font-mono text-[44px] font-black tabular-nums text-brand-900"
                aria-label="Durée de l'appel"
              >
                {formatDuration(call.seconds)}
              </p>
            )}

            {/* Son bloqué par le navigateur : un clic le débloque */}
            {call.audioBlocked && call.state !== "ended" && (
              <button
                type="button"
                onClick={call.enableAudio}
                className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 px-6 text-[22px] font-extrabold text-white hover:bg-brand-700"
              >
                <Volume2 className="h-7 w-7" aria-hidden="true" />
                Activer le son
              </button>
            )}

            {call.state === "ended" ? (
              <button
                type="button"
                onClick={call.reset}
                className="mt-7 min-h-16 w-full rounded-2xl bg-brand-600 px-6 text-[22px] font-extrabold text-white hover:bg-brand-700"
              >
                Fermer
              </button>
            ) : (
              <button
                type="button"
                onClick={call.hangUp}
                className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-danger-500 px-6 text-[22px] font-extrabold text-white hover:bg-danger-600"
              >
                <PhoneOff className="h-7 w-7" aria-hidden="true" />
                {call.state === "active" ? "Raccrocher" : "Annuler l'appel"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fenêtre « Mes proches » : liste des contacts téléphoniques */}
      {callOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setCallOpen(false)}
        >
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ok-500 text-white">
                  <PhoneCall className="h-7 w-7" aria-hidden="true" />
                </span>
                <h2 id="call-title" className="text-[28px] font-black text-brand-900">
                  Qui appeler ?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCallOpen(false)}
                className="flex h-12 w-12 items-center justify-center rounded-xl text-ink hover:bg-brand-50"
                aria-label="Fermer"
              >
                <X className="h-7 w-7" aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-6 space-y-3">
              {CONTACTS.map((c) => (
                <li key={c.phone}>
                  <a
                    href={`tel:${c.phone}`}
                    className="flex min-h-20 items-center gap-4 rounded-2xl border border-line px-5 hover:bg-ok-50"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ok-500 text-white">
                      <Phone className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[22px] font-extrabold text-ink">{c.name}</span>
                      <span className="block text-[16px] text-muted">{c.relation}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setCallOpen(false)}
              className="mt-6 min-h-16 w-full rounded-2xl border border-line px-6 text-[22px] font-bold text-ink hover:bg-brand-50"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Fenêtre check-in : « Êtes-vous en sécurité ? » (avec son) */}
      {checkIn && sosState === "idle" && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="checkin-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-pop">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white">
              <ShieldCheck className="h-11 w-11" aria-hidden="true" />
            </span>
            <h2 id="checkin-title" className="mt-5 text-[30px] font-black text-brand-900">
              {checkIn.title}
            </h2>
            <p className="mt-2 text-[22px] text-ink">{checkIn.message}</p>

            <p className="mt-4 flex items-center justify-center gap-2 text-[20px] font-bold text-danger-600" aria-live="off">
              <Clock className="h-6 w-6" aria-hidden="true" />
              Temps restant : {mm}:{ss}
            </p>

            {checkInError && <p className="mt-3 text-[18px] font-semibold text-danger-600">{checkInError}</p>}

            {/* Le navigateur bloque le son tant qu'on n'a pas touché la page : un clic le débloque */}
            {soundBlocked && (
              <button
                type="button"
                onClick={enableSound}
                className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 px-6 text-[22px] font-extrabold text-white hover:bg-brand-700"
              >
                <Volume2 className="h-7 w-7" aria-hidden="true" />
                Activer le son
              </button>
            )}

            <div className="mt-7 flex flex-col gap-3">
              <button
                type="button"
                onClick={confirmCheckIn}
                disabled={checkInSending}
                className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-ok-500 px-6 text-[24px] font-extrabold text-white hover:bg-ok-600 disabled:opacity-60"
              >
                {checkInSending ? (
                  <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-7 w-7" strokeWidth={3} aria-hidden="true" />
                )}
                Oui, je vais bien
              </button>
              <button
                type="button"
                onClick={() => setSosState("confirm")}
                className="min-h-16 rounded-2xl border border-danger-500 px-6 text-[20px] font-bold text-danger-600 hover:bg-danger-50"
              >
                J&apos;ai besoin d&apos;aide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fenêtre SOS : confirmation, envoi, résultat */}
      {sosState !== "idle" && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="sos-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-pop">
            {sosState === "confirm" && (
              <>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-danger-500 text-white">
                  <AlertTriangle className="h-10 w-10" aria-hidden="true" />
                </span>
                <h2 id="sos-title" className="mt-5 text-[28px] font-black text-brand-900">
                  Envoyer l&apos;alerte ?
                </h2>
                <p className="mt-2 text-[20px] text-ink">Votre aidant sera prévenu immédiatement.</p>
                <div className="mt-7 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={sendSos}
                    className="min-h-16 rounded-2xl bg-danger-500 px-6 text-[22px] font-extrabold text-white hover:bg-danger-600"
                  >
                    Oui, appeler à l&apos;aide
                  </button>
                  <button
                    type="button"
                    onClick={() => setSosState("idle")}
                    className="min-h-16 rounded-2xl border border-line px-6 text-[22px] font-bold text-ink hover:bg-brand-50"
                  >
                    Non, annuler
                  </button>
                </div>
              </>
            )}

            {sosState === "sending" && (
              <>
                <Loader2 className="mx-auto h-16 w-16 animate-spin text-danger-500" aria-hidden="true" />
                <h2 id="sos-title" className="mt-5 text-[26px] font-black text-brand-900">
                  Envoi de l&apos;alerte…
                </h2>
              </>
            )}

            {sosState === "sent" && (
              <>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-ok-500 text-white">
                  <Check className="h-11 w-11" strokeWidth={3} aria-hidden="true" />
                </span>
                <h2 id="sos-title" className="mt-5 text-[28px] font-black text-brand-900">
                  Alerte envoyée
                </h2>
                <p className="mt-2 text-[20px] text-ink">Votre aidant a été prévenu. Restez calme, de l&apos;aide arrive.</p>
                <button
                  type="button"
                  onClick={() => setSosState("idle")}
                  className="mt-7 min-h-16 w-full rounded-2xl bg-brand-600 px-6 text-[22px] font-extrabold text-white hover:bg-brand-700"
                >
                  Fermer
                </button>
              </>
            )}

            {sosState === "error" && (
              <>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-danger-500 text-white">
                  <X className="h-11 w-11" strokeWidth={3} aria-hidden="true" />
                </span>
                <h2 id="sos-title" className="mt-5 text-[28px] font-black text-brand-900">
                  Alerte non envoyée
                </h2>
                <p className="mt-2 text-[20px] text-ink">{sosError}</p>
                <div className="mt-7 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={sendSos}
                    className="min-h-16 rounded-2xl bg-danger-500 px-6 text-[22px] font-extrabold text-white hover:bg-danger-600"
                  >
                    Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={() => setSosState("idle")}
                    className="min-h-16 rounded-2xl border border-line px-6 text-[22px] font-bold text-ink hover:bg-brand-50"
                  >
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
