/**
 * En-tête des pages Senior : logo et un gros bouton « Retour à l'accueil ».
 * Respecte les règles d'accessibilité du projet : texte ≥ 22 px, bouton ≥ 64 px de haut.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/Logo";

// « ?vue=accueil » : ouvre directement le tableau de bord du senior, sans rejouer « Visage reconnu »
export function SeniorHeader({ backHref = "/senior/connexion-reussie?vue=accueil", backLabel = "Accueil" }: { backHref?: string; backLabel?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-line bg-white px-4 sm:px-8">
      <span className="flex items-center gap-2.5">
        <LogoMark className="h-9 w-9" />
        <span className="text-xl font-extrabold tracking-tight text-brand-900">Senior Assistant</span>
      </span>
      <Link href={backHref} className="flex min-h-16 items-center gap-2 rounded-2xl px-4 text-[22px] font-bold text-brand-700 hover:bg-brand-50">
        <ArrowLeft className="h-7 w-7" aria-hidden="true" /> {backLabel}
      </Link>
    </header>
  );
}
