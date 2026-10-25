"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Heart,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Mic,
  Pill,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cx } from "@/components/ui";
import { useRouter } from "next/navigation";
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

const REDIRECT_MS = 3000;

/**
 * Étape 4 du parcours de connexion du senior :
 * 1) carte « Visage reconnu avec succès » avec barre de progression,
 * 2) puis l'accueil du senior (assistant vocal + raccourcis).
 */
export function ConnexionReussie({ data = DEMO, redirectMs = REDIRECT_MS }: { data?: SeniorAccueilData; redirectMs?: number }) {
  const [phase, setPhase] = useState<"succes" | "accueil">("succes");
  const [progress, setProgress] = useState(0);
const [firstName, setFirstName] = useState(data.firstName);
const [lastName, setLastName] = useState(data.lastName);

useEffect(() => {
  const storedFirstName = localStorage.getItem("seniorFirstName");
   const storedLastName = localStorage.getItem("seniorLastName");

  if (storedFirstName) {
    setFirstName(storedFirstName);
  }
    if (storedLastName) {
    setLastName(storedLastName);
  }
}, []);
  useEffect(() => {
    const start = window.setTimeout(() => setProgress(100), 50);
    const done = window.setTimeout(() => setPhase("accueil"), redirectMs);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(done);
    };
  }, [redirectMs]);
const connectedSenior = {
  ...data,
  firstName,
  lastName,
};
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

function SeniorAccueil({ data }: { data: SeniorAccueilData }) {
  
  const [listening, setListening] = useState(false);
  const [priseConfirmee, setPriseConfirmee] = useState(false);
const router = useRouter();
  return (
    <div className="fade-up flex min-h-screen flex-1 flex-col bg-canvas">
      {/* En-tête */}
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-line bg-white px-4 sm:px-8">
        <span className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight text-brand-900">Senior Assistant</span>
        </span>
        <div className="flex items-center gap-2 sm:gap-4">
          <button type="button" className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-ink hover:bg-brand-50" aria-label="Notifications">
            <Bell className="h-7 w-7" />
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-danger-500" aria-hidden="true" />
          </button>
          <button type="button" className="flex min-h-14 items-center gap-3 rounded-2xl px-2 hover:bg-brand-50">
            <Portrait data={data} className="h-11 w-11" />
            <span className="hidden text-lg font-bold text-ink sm:block">
              {data.firstName} {data.lastName}
            </span>
            <ChevronDown className="hidden h-5 w-5 text-muted sm:block" aria-hidden="true" />
          </button>
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
          <button type="button" className="mt-auto flex min-h-16 w-full items-center gap-4 rounded-2xl px-4 text-[20px] font-bold text-danger-600 hover:bg-danger-50">
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
            aria-current={label === "Accueil" ? "page" : undefined}
            className={cx("flex min-h-20 flex-col items-center justify-center gap-1 text-sm font-bold", label === "Accueil" ? "text-brand-700" : "text-ink")}
          >
            <Icon className={cx("h-7 w-7", label === "Accueil" ? "text-brand-600" : "text-slate-500")} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
