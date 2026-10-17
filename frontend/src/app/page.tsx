import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Camera,
  Check,
  HeartHandshake,
  Mic,
  Phone,
  Pill,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Volume2,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";

const SPACES = [
  {
    href: "/senior",
    title: "Espace Senior",
    text: "Accéder à votre assistant",
    icon: UserRound,
    cls: "bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-600/25",
    iconCls: "bg-white/15 text-white",
    subCls: "text-white/80",
  },
  {
    href: "/connexion?espace=aidant",
    title: "Espace Aidant",
    text: "Suivre et gérer",
    icon: Users,
    cls: "bg-ok-50 text-ink hover:bg-[#dcf3e6] border border-ok-500/20",
    iconCls: "bg-white text-ok-600",
    subCls: "text-muted",
  },
  {
    href: "/connexion?espace=admin",
    title: "Administration",
    text: "Superviser la plateforme",
    icon: Settings2,
    cls: "bg-violet-50 text-ink hover:bg-[#e7e0ff] border border-violet-500/20",
    iconCls: "bg-white text-violet-500",
    subCls: "text-muted",
  },
];

const PILLARS = [
  { icon: Mic, label: "Parlez naturellement" },
  { icon: ShieldCheck, label: "Restez en sécurité" },
  { icon: HeartHandshake, label: "Gardez le lien avec vos proches" },
];

const MODULES = [
  { id: "F1", icon: Mic, title: "Assistant vocal à mémoire", text: "Parler naturellement et obtenir une réponse à voix haute, comme avec un proche." },
  { id: "F2", icon: CalendarCheck, title: "Agenda et rappels", text: "Ne plus oublier médicaments et rendez-vous, avec un rappel créé simplement à la voix." },
  { id: "F3", icon: Camera, title: "Photo → Compris", text: "Photographier un courrier ou une ordonnance et en recevoir une explication simple." },
  { id: "F4", icon: Sparkles, title: "Souvenirs", text: "Raconter et réécouter ses souvenirs pour stimuler la mémoire et garder le lien." },
  { id: "F5", icon: Phone, title: "Famille et sécurité", text: "Appeler un proche ou déclencher un SOS d'une simple phrase." },
  { id: "F6", icon: BellRing, title: "Espace Aidant", text: "Suivre les prises, recevoir les alertes et une synthèse hebdomadaire." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-brand-50 via-white to-canvas">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2 text-[15px] font-semibold">
          <a href="#fonctionnalites" className="hidden rounded-lg px-3 py-2 text-muted hover:text-brand-700 sm:block">
            Fonctionnalités
          </a>
          <Link href="/connexion?espace=aidant" className="rounded-xl bg-white px-4 py-2.5 text-brand-700 shadow-card hover:bg-brand-50">
            Se connecter
          </Link>
        </nav>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pt-6 pb-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-12">
        <div className="fade-up">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-brand-700 shadow-card">
            <Sparkles className="h-4 w-4" /> Assistant vocal intelligent
          </p>
          <h1 className="mt-6 text-5xl font-black tracking-tight text-brand-900 sm:text-6xl">
            Senior <span className="text-brand-600">Assistant</span>
          </h1>
          <p className="mt-5 text-2xl font-semibold leading-snug text-ink sm:text-[28px]">
            Votre voix, votre quotidien,
            <br /> notre priorité.
          </p>
          <p className="mt-4 max-w-lg text-xl leading-relaxed text-muted">
            Un assistant vocal intelligent pour plus d&apos;autonomie et de sérénité, et un espace pour que les proches restent
            rassurés.
          </p>

          <ul className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {PILLARS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center gap-2.5 rounded-2xl bg-white/80 px-2 py-4 text-center shadow-card">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-sm font-bold leading-tight text-ink">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative fade-up overflow-x-clip sm:overflow-visible" style={{ animationDelay: "120ms" }}>
          <HeroVisual />
        </div>
      </section>

      {/* ---------- Choix de l'espace ---------- */}
      <section aria-labelledby="espaces" className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-8">
        <div className="rounded-[28px] bg-white p-6 shadow-card sm:p-10">
          <h2 id="espaces" className="text-center text-2xl font-extrabold text-brand-900 sm:text-3xl">
            Choisissez votre espace
          </h2>
          <p className="mt-2 text-center text-lg text-muted">Une application pensée pour vous, plus simple, plus humaine.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SPACES.map(({ href, title, text, icon: Icon, cls, iconCls, subCls }) => (
              <Link key={href} href={href} className={`group flex min-h-24 items-center gap-4 rounded-2xl px-6 py-5 transition-all ${cls}`}>
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconCls}`}>
                  <Icon className="h-7 w-7" />
                </span>
                <span className="flex-1">
                  <span className="block text-[22px] font-extrabold leading-tight">{title}</span>
                  <span className={`block text-base ${subCls}`}>{text}</span>
                </span>
                <ArrowRight className="h-6 w-6 shrink-0 opacity-60 transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Fonctionnalités ---------- */}
      <section id="fonctionnalites" className="mx-auto w-full max-w-7xl scroll-mt-8 px-4 pb-20 sm:px-8">
        <p className="text-sm font-extrabold uppercase tracking-widest text-brand-600">Ce que fait Senior Assistant</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-brand-900 sm:text-4xl">
          Tout le quotidien, piloté à la voix
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ id, icon: Icon, title, text }) => (
            <article key={id} className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-sm font-black text-brand-200">{id}</span>
              </div>
              <h3 className="mt-5 text-xl font-extrabold text-ink">{title}</h3>
              <p className="mt-2 text-[17px] leading-relaxed text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Dialogue ---------- */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-8">
        <div className="grid items-center gap-10 overflow-hidden rounded-[28px] bg-brand-900 p-8 text-white sm:p-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Aussi simple qu&apos;une conversation</h2>
            <p className="mt-4 text-lg leading-relaxed text-brand-100">
              Pas de menus compliqués : on appuie sur le micro et on parle. L&apos;assistant comprend, agit et répond à voix
              haute. Les données personnelles sont anonymisées avant chaque appel à l&apos;IA.
            </p>
            <ul className="mt-6 space-y-3 text-lg">
              {["Gros boutons et gros caractères", "Rappels de médicaments et rendez-vous", "Alerte immédiate des proches en cas de besoin"].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok-500">
                    <Check className="h-4 w-4" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 text-lg">
            <div className="ml-auto max-w-sm rounded-3xl rounded-br-md bg-white/10 px-5 py-4">
              <p className="text-sm font-bold text-brand-200">Marie</p>« Rappelle-moi de prendre mon médicament à 20h. »
            </div>
            <div className="max-w-sm rounded-3xl rounded-bl-md bg-white px-5 py-4 text-ink">
              <p className="flex items-center gap-1.5 text-sm font-bold text-brand-600">
                <Volume2 className="h-4 w-4" /> Assistant
              </p>
              « D&apos;accord, je vous le rappellerai à 20h. »
            </div>
            <div className="ml-auto max-w-sm rounded-3xl rounded-br-md bg-white/10 px-5 py-4">
              <p className="text-sm font-bold text-brand-200">Marie</p>« Qu&apos;ai-je prévu aujourd&apos;hui ? »
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-8">
          <span className="flex items-center gap-2 font-bold text-brand-900">
            <LogoMark className="h-6 w-6" /> Senior Assistant
          </span>
          <span>Plus d&apos;autonomie, plus de lien, plus de vie.</span>
          <span>« La technologie au service de l&apos;humain »</span>
        </div>
      </footer>
    </div>
  );
}

// Aperçu illustré de l'interface Senior
function HeroVisual() {
  return (
    <div className="relative mx-auto max-w-md lg:max-w-none">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-brand-200/60 via-brand-100/40 to-transparent blur-2xl" />
      <div className="rounded-[32px] border border-white bg-white/90 p-6 shadow-pop backdrop-blur sm:p-8">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-brand-900">
            <LogoMark className="h-6 w-6" /> Senior Assistant
          </span>
          <span className="text-sm font-semibold text-muted">10:24</span>
        </div>
        <p className="mt-6 text-[28px] font-extrabold text-brand-900">Bonjour Marie,</p>
        <p className="text-xl text-ink">Comment puis-je vous aider aujourd&apos;hui ?</p>

        <div className="my-8 flex flex-col items-center">
          <span className="pulse-ring relative flex h-32 w-32 items-center justify-center rounded-full text-brand-300">
            <span className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/40">
              <Mic className="h-14 w-14" />
            </span>
          </span>
          <p className="mt-5 text-xl font-extrabold text-brand-700">Parlez maintenant</p>
          <p className="text-base text-muted">Dites votre demande, naturellement…</p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: CalendarCheck, label: "Agenda", c: "text-brand-600 bg-brand-50" },
            { icon: Pill, label: "Médicaments", c: "text-ok-600 bg-ok-50" },
            { icon: Phone, label: "Proches", c: "text-violet-500 bg-violet-50" },
            { icon: BellRing, label: "SOS", c: "text-white bg-danger-500" },
          ].map(({ icon: Icon, label, c }) => (
            <div key={label} className="flex flex-col items-center gap-2 rounded-2xl border border-line py-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${c}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold text-ink">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -left-4 top-52 hidden w-48 rounded-2xl border border-line bg-white p-4 shadow-pop sm:block lg:-left-12">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">08:30</p>
        <p className="mt-1 font-bold text-ink">Prise de médicament</p>
        <p className="text-sm text-muted">Paracétamol 1 g</p>
        <p className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-ok-600">
          <Check className="h-4 w-4" /> Confirmé
        </p>
      </div>
      <div className="absolute -bottom-12 right-6 hidden w-52 rounded-2xl bg-brand-600 p-4 text-white shadow-pop sm:block">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Aujourd&apos;hui</p>
        <p className="mt-1 font-bold">2 rendez-vous · 3 prises</p>
      </div>
    </div>
  );
}
