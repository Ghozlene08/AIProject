"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Mic } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useVoiceAssistant } from "./connexion-reussie/useVoiceAssistant";

export function SeniorLogin() {
  const voice = useVoiceAssistant();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  return <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-white">
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6"><Logo /><Link href="/" className="flex min-h-16 items-center gap-2 text-[22px] font-bold text-brand-900"><ArrowLeft className="h-6 w-6" />Accueil</Link></header>
    <main className="mx-auto w-full max-w-xl px-5 pb-12 pt-6 text-[22px] text-ink">
      <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg"><Mic className="h-12 w-12" aria-hidden="true" /></span>
      <h1 className="mt-6 text-center text-4xl font-extrabold text-brand-900">Connexion Senior</h1>
      <p className="mt-4 text-center leading-relaxed">Saisissez le code d’appairage et le PIN que votre aidant vient de vous donner.</p>
      <form className="mt-7 space-y-5 rounded-[28px] border border-brand-100 bg-white p-6 shadow-card sm:p-8" onSubmit={async (event) => {
        event.preventDefault();
        if (voice.busy || voice.restoring) return;
        if (await voice.connect(code.trim(), pin)) { setPin(""); router.replace("/senior/connexion-reussie"); }
      }}>
        <label className="block font-bold">Code d’appairage<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={30} placeholder="Exemple : ABC234" className="mt-2 min-h-16 w-full rounded-2xl border-2 border-brand-200 px-4 font-normal uppercase" /></label>
        <label className="block font-bold">Code PIN<input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{4,8}" minLength={4} maxLength={8} placeholder="Votre PIN" className="mt-2 min-h-16 w-full rounded-2xl border-2 border-brand-200 px-4 font-normal" /></label>
        {voice.error && <p role="alert" className="font-semibold text-red-900">{voice.error}</p>}
        <button disabled={voice.busy || voice.restoring} className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-700 px-4 font-bold text-white hover:bg-brand-800 disabled:opacity-50"><KeyRound className="h-6 w-6" aria-hidden="true" />{voice.restoring ? "Chargement…" : voice.busy ? "Connexion…" : "Me connecter"}</button>
        <p className="leading-relaxed text-muted">La connexion est conservée sur cet appareil pendant 30 jours. Votre PIN reste privé.</p>
      </form>
      {voice.connected && <Link href="/senior/connexion-reussie" className="mt-5 flex min-h-16 items-center justify-center rounded-2xl border-2 border-brand-700 px-4 text-center font-bold text-brand-900">Continuer avec {voice.profile} {voice.lastName}</Link>}
      <Link href="/aidant" className="mt-4 flex min-h-16 items-center justify-center text-center font-bold text-brand-900 underline">Retour à l’espace Aidant</Link>
    </main>
  </div>;
}
