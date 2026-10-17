import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, Mic } from "lucide-react";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Espace Senior" };

// Point d'entrée de l'interface Senior (module vocal intégré séparément)
export default function SeniorPage() {
  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold text-brand-700">
          <ArrowLeft className="h-5 w-5" /> Accueil
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-5 py-10 text-center">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/30">
          <Mic className="h-14 w-14" />
        </span>
        <h1 className="mt-8 text-4xl font-black text-brand-900">Espace Senior</h1>
        <p className="mt-4 text-[22px] leading-relaxed text-ink">
          Pour commencer, votre proche aidant vous donne un <strong>code d&apos;appairage</strong> et un <strong>code PIN</strong>.
        </p>
        <div className="mt-10 w-full rounded-3xl border border-line bg-white p-8 text-left shadow-card">
          <p className="flex items-center gap-3 text-[22px] font-extrabold text-brand-900">
            <KeyRound className="h-7 w-7 text-brand-600" /> Comment se connecter ?
          </p>
          <ol className="mt-5 space-y-4 text-[22px] text-ink">
            <li>1. Votre aidant crée votre profil dans son espace.</li>
            <li>2. Il vous communique votre code et votre PIN.</li>
            <li>3. Vous parlez à l&apos;assistant, tout simplement.</li>
          </ol>
        </div>
        <p className="mt-8 text-lg text-muted">L&apos;interface vocale du senior est livrée avec le module « Assistant vocal ».</p>
      </main>
    </div>
  );
}
