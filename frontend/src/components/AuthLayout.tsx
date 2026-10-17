import Link from "next/link";
import { ArrowLeft, BellRing, HeartHandshake, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";

// Mise en page des écrans de connexion / inscription
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative rounded-2xl bg-white/95 px-4 py-3 self-start">
          <Logo />
        </div>
        <div className="relative mt-auto">
          <h2 className="text-4xl font-extrabold leading-tight">
            Prenez soin de vous
            <br /> et de ceux que vous aimez.
          </h2>
          <ul className="mt-8 space-y-4 text-lg text-brand-50">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-brand-200" /> Suivi des traitements en temps réel
            </li>
            <li className="flex items-center gap-3">
              <BellRing className="h-6 w-6 text-brand-200" /> Alertes en cas de prise manquée ou de SOS
            </li>
            <li className="flex items-center gap-3">
              <HeartHandshake className="h-6 w-6 text-brand-200" /> Une synthèse hebdomadaire rédigée par l&apos;IA
            </li>
          </ul>
        </div>
      </aside>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-10">{children}</div>
      </div>
    </div>
  );
}
