"use client";

import { Camera, ChevronLeft, Images, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function CameraDocumentPage() {
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error(err);
        setError(
          "Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur."
        );
      }
    }

    startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
function takePhoto() {
  const video = videoRef.current;
  const canvas = canvasRef.current;

  if (!video || !canvas) return;

  if (!video.videoWidth || !video.videoHeight) {
    setError("La caméra n'est pas encore prête.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");

  if (!context) return;

  context.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const image = canvas.toDataURL("image/jpeg", 0.9);

  setPhoto(image);

  streamRef.current?.getTracks().forEach((track) => track.stop());
}

async function retakePhoto() {
  setPhoto(null);
  setError("");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });

    streamRef.current = stream;

    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    }, 100);
  } catch (err) {
    console.error(err);
    setError("Impossible de redémarrer la caméra.");
  }
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
            Photographier un document
          </h1>
        </div>

        {/* Caméra */}
        <div className="relative mt-6 overflow-hidden rounded-3xl bg-black shadow-lg">

          <div className="relative aspect-[3/4] bg-black">

           {photo ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={photo}
    alt="Document photographié"
    className="h-full w-full object-cover"
  />
) : (
  <video
    ref={videoRef}
    autoPlay
    playsInline
    muted
    className="h-full w-full object-cover"
  />
)}

            {/* Instruction */}
            <div className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-5 py-2 text-sm font-semibold text-white">
              Placez le document dans le cadre
            </div>

            {/* Cadre document */}
            <div className="pointer-events-none absolute inset-10 border-2 border-white/80">

              {/* Coin haut gauche */}
              <span className="absolute -left-1 -top-1 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-white" />

              {/* Coin haut droit */}
              <span className="absolute -right-1 -top-1 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-white" />

              {/* Coin bas gauche */}
              <span className="absolute -bottom-1 -left-1 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-white" />

              {/* Coin bas droit */}
              <span className="absolute -bottom-1 -right-1 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-white" />
            </div>
          </div>

          {/* Barre inférieure */}
        {/* Barre inférieure */}
{!photo ? (
  <div className="flex h-32 items-center justify-between bg-black px-10">

    {/* Galerie */}
    <button
      type="button"
      className="flex flex-col items-center gap-2 text-white"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
        <Images className="h-7 w-7" />
      </span>

      <span className="text-sm font-semibold">
        Galerie
      </span>
    </button>

    {/* Prendre la photo */}
    <button
      type="button"
      onClick={takePhoto}
      aria-label="Prendre la photo"
      className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white"
    >
      <span className="h-16 w-16 rounded-full bg-brand-500 ring-4 ring-white" />
    </button>

    {/* Retourner */}
    <button
      type="button"
      className="flex flex-col items-center gap-2 text-white"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
        <RotateCcw className="h-7 w-7" />
      </span>

      <span className="text-sm font-semibold">
        Retourner
      </span>
    </button>

  </div>
) : (
  <div className="flex gap-4 bg-white p-5">

    <button
      type="button"
      onClick={retakePhoto}
      className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-brand-200 bg-white px-4 text-lg font-extrabold text-brand-700"
    >
      <RotateCcw className="h-6 w-6" />
      Reprendre
    </button>

    <button
      type="button"
      className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-lg font-extrabold text-white shadow-sm hover:bg-brand-700"
    >
      Utiliser cette photo
    </button>

  </div>
)}
        </div>

        {/* Erreur caméra */}
        {error && (
          <div className="mt-5 rounded-2xl bg-red-50 p-4 text-center font-semibold text-red-600">
            {error}
          </div>
        )}

      </div>
      <canvas
  ref={canvasRef}
  className="hidden"
/>
    </main>
  );
  
}