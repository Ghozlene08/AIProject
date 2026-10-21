"use client";

import {
  ChevronLeft,
  FileText,
  Home,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DocumentExplanationPage() {
  const router = useRouter();
const [isSpeaking, setIsSpeaking] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [provider, setProvider] = useState("");

  useEffect(() => {
    const savedExplanation = sessionStorage.getItem(
      "seniorDocumentExplanation"
    );

    const savedProvider = sessionStorage.getItem(
      "seniorDocumentProvider"
    );

    if (!savedExplanation) {
      router.replace("/senior/documents");
      return;
    }

    setExplanation(savedExplanation);
    setProvider(savedProvider || "");
  }, [router]);
function speakExplanation() {
  if (!explanation) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(explanation);

  utterance.lang = "fr-FR";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  utterance.onstart = () => {
    setIsSpeaking(true);
  };

  utterance.onend = () => {
    setIsSpeaking(false);
  };

  utterance.onerror = () => {
    setIsSpeaking(false);
  };

  window.speechSynthesis.speak(utterance);
}
function stopExplanation() {
  window.speechSynthesis.cancel();
  setIsSpeaking(false);
}
  if (!explanation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-lg font-semibold text-muted">
          Chargement de l'explication...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-6">
      <div className="mx-auto w-full max-w-2xl">

        {/* En-tête */}
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="absolute left-0 flex h-12 w-12 items-center justify-center rounded-full hover:bg-brand-50"
            aria-label="Retour"
          >
            <ChevronLeft className="h-7 w-7 text-brand-900" />
          </button>

          <h1 className="text-2xl font-black text-brand-900">
            Explication du document
          </h1>
        </div>

        {/* Message principal */}
        <div className="mt-7 rounded-3xl bg-white p-6 shadow-sm">

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
              <Sparkles className="h-6 w-6 text-brand-700" />
            </div>

            <div>
              <h2 className="text-xl font-black text-brand-900">
                Voici ce que j&apos;ai compris
              </h2>

              <p className="text-sm text-muted">
                Explication simplifiée de votre document
              </p>
            </div>
          </div>

          {/* Explication IA */}
          <div className="mt-6 whitespace-pre-wrap text-lg leading-8 text-brand-900">
            {explanation}
          </div>

        </div>

        {/* Lire à voix haute */}
      {!isSpeaking ? (
  <button
    type="button"
    onClick={speakExplanation}
    className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 px-5 text-lg font-extrabold text-white shadow-sm hover:bg-brand-700"
  >
    <Volume2 className="h-7 w-7" />
    Écouter l&apos;explication
  </button>
) : (
  <button
    type="button"
    onClick={stopExplanation}
    className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 px-5 text-lg font-extrabold text-white shadow-sm hover:bg-brand-700"
  >
    ⏹ Arrêter la lecture
  </button>
)}

        {/* Nouveau document */}
        <button
          type="button"
          onClick={() => router.push("/senior/documents")}
          className="mt-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 border-brand-200 bg-white px-5 text-lg font-extrabold text-brand-700"
        >
          <FileText className="h-6 w-6" />
          Analyser un autre document
        </button>

        {/* Accueil */}
        <button
          type="button"
          onClick={() => router.push("/senior/connexion-reussie")}
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 text-base font-bold text-muted"
        >
          <Home className="h-5 w-5" />
          Retour à l&apos;accueil
        </button>

        {/* Provider uniquement pour nos tests */}
        {provider && (
          <p className="mt-5 text-center text-xs text-muted">
            Analyse réalisée avec {provider}
          </p>
        )}

      </div>
    </main>
  );
}