"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  ScanFace,
} from "lucide-react";

type FaceLoginProps = {
  onBack: () => void;
};

export function FaceLogin({ onBack }: FaceLoginProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setCameraReady(true);
      } catch (error) {
        console.error("Erreur caméra :", error);

        setCameraError(
          "Impossible d'accéder à la caméra. Vérifiez que vous avez autorisé son utilisation."
        );
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, []);

  function handleRecognition() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    // Vérifier que la caméra est prête
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("La caméra n'est pas encore prête.");
      return;
    }

    // Donner au canvas la taille réelle de la vidéo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError("Impossible de capturer l'image.");
      return;
    }

    // Copier l'image actuelle de la webcam
    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Transformer l'image en JPEG
    const image = canvas.toDataURL("image/jpeg", 0.9);

    setCapturedImage(image);

    console.log("Photo capturée !");
  }

  return (
    <div>
      {/* Retour */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Retour
      </button>

      {/* Titre */}
      <div className="mt-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <ScanFace className="h-8 w-8 text-brand-600" />
        </div>

        <h1 className="mt-4 text-2xl font-extrabold text-brand-900">
          Regardez la caméra
        </h1>

        <p className="mt-2 text-sm text-muted">
          Placez votre visage au centre du cadre.
        </p>
      </div>

      {/* Zone caméra */}
      <div className="mt-6">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-slate-900 shadow-lg">

          {/* Webcam */}
          {!cameraError && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />

              {/* Canvas invisible utilisé pour prendre la photo */}
              <canvas
                ref={canvasRef}
                className="hidden"
              />
            </>
          )}

          {/* Cadre visage */}
          {cameraReady && !cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-44 rounded-[50%] border-4 border-white/80 shadow-lg" />
            </div>
          )}

          {/* Chargement */}
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <Camera className="mx-auto h-10 w-10" />

                <p className="mt-3 font-semibold">
                  Ouverture de la caméra...
                </p>

                <p className="mt-1 text-sm text-white/70">
                  Autorisez l'accès à votre caméra.
                </p>
              </div>
            </div>
          )}

          {/* Erreur */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-white">
              <div className="text-center">
                <CameraOff className="mx-auto h-10 w-10" />

                <p className="mt-3 font-semibold">
                  Caméra indisponible
                </p>

                <p className="mt-2 text-sm text-white/80">
                  {cameraError}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Conseils */}
        {!cameraError && (
          <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-center">
            <p className="font-bold text-brand-900">
              Gardez votre visage bien visible
            </p>

            <p className="mt-1 text-sm text-muted">
              Regardez la caméra et assurez-vous d'être dans un endroit bien
              éclairé.
            </p>
          </div>
        )}

        {/* Bouton capture */}
        <button
          type="button"
          disabled={!cameraReady || !!cameraError}
          onClick={handleRecognition}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-4 font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ScanFace className="h-5 w-5" />
          Me reconnaître
        </button>

      </div>
    </div>
  );
}