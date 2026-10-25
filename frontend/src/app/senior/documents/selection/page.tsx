"use client";

import {
  ChevronLeft,
  FileText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DocumentSelectionPage() {
  const router = useRouter();

  const [photo, setPhoto] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("document.jpg");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const isPdf = documentName.toLowerCase().endsWith(".pdf");

  useEffect(() => {
  const savedPhoto = sessionStorage.getItem("seniorDocumentPhoto");
  const savedName = sessionStorage.getItem("seniorDocumentName");

  if (!savedPhoto) {
    router.replace("/senior/documents");
    return;
  }

  setPhoto(savedPhoto);
  setDocumentName(savedName || "document.jpg");
}, [router]);
async function explainDocument() {
  if (!photo) return;

  try {
    setIsAnalyzing(true);
    setError("");

    // Transformer la photo base64 en vrai fichier
    const imageResponse = await fetch(photo);
    const blob = await imageResponse.blob();

  const file = new File(
  [blob],
  documentName,
  { type: blob.type || "image/jpeg" }
);

    // Préparer le multipart/form-data
    const formData = new FormData();
    formData.append("document", file);

    // Envoyer le document au backend
    const response = await fetch(
      "http://localhost:5000/api/documents/explain",
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Impossible d'expliquer le document."
      );
    }

    console.log("Résultat de l'analyse :", data);

    // On conserve le résultat pour l'écran suivant
    sessionStorage.setItem(
      "seniorDocumentExplanation",
      data.explanation
    );

    sessionStorage.setItem(
      "seniorDocumentExtractedText",
      data.extractedText
    );

    sessionStorage.setItem(
      "seniorDocumentProvider",
      data.provider
    );

    // Pour l'instant, on ne change pas encore de page.
   router.push("/senior/documents/explication");
  } catch (err) {
    console.error(err);

    setError(
      err instanceof Error
        ? err.message
        : "Une erreur est survenue pendant l'analyse."
    );
  } finally {
    setIsAnalyzing(false);
  }
}
  if (!photo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-lg font-semibold text-muted">
          Chargement du document...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-6">
      <div className="mx-auto w-full max-w-2xl">

        {/* Retour au tableau de bord du senior (toujours le même, quelle que soit la page précédente).
            « ?vue=accueil » ouvre directement l'accueil, sans rejouer « Visage reconnu avec succès ». */}
        <button
          type="button"
          onClick={() => router.push("/senior/connexion-reussie?vue=accueil")}
          className="flex min-h-16 items-center gap-2 rounded-2xl px-3 text-[22px] font-bold text-brand-700 hover:bg-brand-50"
        >
          <ChevronLeft className="h-7 w-7" aria-hidden="true" /> Accueil
        </button>

        {/* En-tête */}
        <div className="mt-2 flex items-center justify-center">
          <h1 className="text-2xl font-black text-brand-900">
            Document sélectionné
          </h1>
        </div>

        {/* Aperçu du document */}
        <div className="mt-7 overflow-hidden rounded-3xl bg-white p-4 shadow-sm">
         <div className="overflow-hidden rounded-2xl bg-gray-100">
  {isPdf ? (
    <div className="flex min-h-[350px] flex-col items-center justify-center gap-4 p-8">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-red-50">
        <FileText className="h-14 w-14 text-red-600" />
      </div>

      <p className="text-xl font-extrabold text-brand-900">
        Document PDF
      </p>

      <p className="max-w-md text-center text-base text-muted">
        {documentName}
      </p>
    </div>
  ) : (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt="Document sélectionné"
        className="max-h-[520px] w-full object-contain"
      />
    </>
  )}
</div>

          {/* Nom du document */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <FileText className="h-6 w-6 text-brand-700" />
            </div>

            <div>
             <p className="font-extrabold text-brand-900">
  {documentName}
</p>

              <p className="text-sm text-muted">
  {isPdf
    ? "PDF prêt à être analysé"
    : "Photo prête à être analysée"}
</p>
            </div>
          </div>
        </div>
        {/* Changer le document */}
        <button
          type="button"
         onClick={() => router.push("/senior/documents")}
          className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border-2 border-brand-200 bg-white px-5 text-lg font-extrabold text-brand-700"
        >
          <RotateCcw className="h-6 w-6" />
          Changer le document
        </button>

        {/* Expliquer */}
        <button
          type="button"
           onClick={explainDocument}
           disabled={isAnalyzing}
          className="mt-4 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 px-5 text-lg font-extrabold text-white shadow-sm hover:bg-brand-700"
        >
          <Sparkles className="h-6 w-6" />
           {isAnalyzing
             ? "Analyse du document..."
             : "Expliquer ce document"}
        </button>
{error && (
  <div className="mt-4 rounded-2xl bg-red-50 p-4 text-center font-semibold text-red-600">
    {error}
  </div>
)}
      </div>
    </main>
  );
}