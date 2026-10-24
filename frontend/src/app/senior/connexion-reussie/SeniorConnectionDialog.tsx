"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { VoiceController } from "./useVoiceAssistant";

export function SeniorConnectionDialog({ voice }: { voice: VoiceController }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  useEffect(() => {
    if (voice.loginOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [voice.loginOpen]);
  return <dialog ref={dialog} aria-labelledby="senior-connection-title" onCancel={(event) => { if (voice.busy) event.preventDefault(); else voice.setLoginOpen(false); }} onClose={() => voice.setLoginOpen(false)} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-[28px] border border-line bg-white p-7 text-[22px] text-ink shadow-pop backdrop:bg-brand-900/40">
    <div className="flex items-start justify-between gap-3"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><KeyRound className="h-8 w-8" /></span><button type="button" aria-label="Fermer la connexion" disabled={voice.busy} onClick={() => voice.setLoginOpen(false)} className="flex h-16 w-16 items-center justify-center rounded-2xl hover:bg-brand-50"><X /></button></div>
    <h2 id="senior-connection-title" className="mt-4 text-[30px] font-extrabold text-brand-900">Bienvenue dans votre espace</h2>
    <p className="mt-3 leading-relaxed">Connectez votre profil une fois sur cet appareil. Votre connexion sera conservée pendant 30 jours.</p>
    <form className="mt-6 space-y-5" onSubmit={async (event) => { event.preventDefault(); if (voice.busy) return; await voice.connect(code, pin); setPin(""); }}>
      <label className="block font-bold">Code d’appairage<input autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={30} className="mt-2 min-h-16 w-full rounded-2xl border-2 border-brand-200 px-4 font-normal" /></label>
      <label className="block font-bold">Code PIN<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} required minLength={4} maxLength={8} className="mt-2 min-h-16 w-full rounded-2xl border-2 border-brand-200 px-4 font-normal" /></label>
      {voice.error && <p role="alert" className="font-semibold text-red-900">{voice.error}</p>}
      <button className="min-h-16 w-full rounded-2xl bg-brand-700 px-5 font-bold text-white disabled:opacity-50" disabled={voice.busy}>{voice.busy ? "Connexion…" : "Entrer dans mon espace"}</button>
    </form>
  </dialog>;
}
