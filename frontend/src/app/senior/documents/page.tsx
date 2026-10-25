"use client";

import { Camera, ChevronLeft, ChevronRight, FolderOpen, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
export default function DocumentsPage() {
  const router = useRouter();
const fileInputRef = useRef<HTMLInputElement>(null);

function handleChooseDocument() {
  fileInputRef.current?.click();
}

function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];

  if (!file) return;

  const acceptedTypes = [
    "image/jpeg",
    "image/png",
    "application/pdf",
  ];

  if (!acceptedTypes.includes(file.type)) {
    alert("Veuillez choisir un fichier PDF, JPG ou PNG.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const result = reader.result;

    if (typeof result !== "string") return;

    sessionStorage.setItem("seniorDocumentPhoto", result);
    sessionStorage.setItem("seniorDocumentName", file.name);
    sessionStorage.setItem("seniorDocumentType", file.type);

    router.push("/senior/documents/selection");
  };

  reader.readAsDataURL(file);
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

          <h1 className="text-3xl font-black text-brand-900">
            Mes documents
          </h1>
        </div>

        {/* Description */}
        <p className="mx-auto mt-6 max-w-md text-center text-xl leading-relaxed text-ink">
          Faites expliquer un document simplement
          <br />
          par l&apos;assistant.
        </p>

        {/* Photographier */}
        <button
          type="button"
          onClick={() => router.push("/senior/documents/camera")}
          className="mt-8 flex w-full items-center gap-5 rounded-3xl border border-brand-100 bg-brand-50 p-6 text-left shadow-sm transition hover:shadow-md"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Camera className="h-9 w-9" />
          </span>

          <span className="flex-1">
            <span className="block text-xl font-extrabold text-brand-900">
              Photographier un document
            </span>

            <span className="mt-1 block text-lg text-muted">
              Prenez en photo un courrier,
              <br />
              une ordonnance...
            </span>
          </span>

          <ChevronRight className="h-7 w-7 text-brand-900" />
        </button>
<input
  ref={fileInputRef}
  type="file"
  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
  onChange={handleFileChange}
  className="hidden"
/>
        {/* Choisir un document */}
        <button
          type="button"
          onClick={handleChooseDocument}
          className="mt-4 flex w-full items-center gap-5 rounded-3xl border border-amber-100 bg-amber-50 p-6 text-left shadow-sm transition hover:shadow-md"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-white">
            <FolderOpen className="h-9 w-9" />
          </span>

          <span className="flex-1">
            <span className="block text-xl font-extrabold text-brand-900">
              Choisir un document
            </span>

            <span className="mt-1 block text-lg text-muted">
              Depuis votre téléphone ou votre ordinateur
              <br />
              (PDF, JPG, PNG)
            </span>
          </span>

          <ChevronRight className="h-7 w-7 text-brand-900" />
        </button>

        {/* Informations */}
        <div className="mt-5 flex gap-4 rounded-3xl border border-brand-100 bg-brand-50 p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
            <Info className="h-6 w-6" />
          </span>

          <div>
            <p className="text-lg font-extrabold text-brand-900">
              Types de documents acceptés :
            </p>

            <p className="text-lg text-ink">
              PDF, JPG, PNG
            </p>

            <p className="mt-2 text-base text-muted">
              Courriers, ordonnances, factures, documents administratifs...
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}