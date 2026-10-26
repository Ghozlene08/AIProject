/**
 * Interface Senior — Souvenirs : « Raconter un souvenir » (module F4).
 * Page d'arrivée après le choix fait sur /senior/souvenirs.
 * ⚠️ Provisoire : le contenu sera construit à l'étape suivante (l'enregistrement de votre souvenir au micro).
 */
import { SeniorHeader } from "@/components/senior/SeniorHeader";

export default function SeniorRaconterPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-canvas">
      <SeniorHeader backHref="/senior/souvenirs" backLabel="Souvenirs" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-[40px] font-black text-brand-900">Raconter un souvenir</h1>
        <p className="mt-4 text-[24px] text-ink">Bientôt ici : l'enregistrement de votre souvenir au micro.</p>
      </main>
    </div>
  );
}
