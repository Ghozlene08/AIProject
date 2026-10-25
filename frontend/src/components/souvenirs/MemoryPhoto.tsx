"use client";

/**
 * Affiche une photo de souvenir protégée par le jeton JWT.
 * Une balise <img src="…"> ne peut pas envoyer le jeton : on télécharge donc la photo
 * avec fetch, puis on l'affiche via une adresse locale « blob: » libérée à la fin.
 */
import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { cx } from "@/components/ui";
import { fetchPhotoUrl } from "@/lib/souvenirs/api";

export function MemoryPhoto({
  path,
  alt,
  className,
  load = fetchPhotoUrl,
}: {
  path: string;
  alt: string;
  className?: string;
  /** Fonction de téléchargement (par défaut : avec le jeton de l'aidant) */
  load?: (path: string) => Promise<string>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    load(path)
      .then((u) => {
        objectUrl = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch(() => !cancelled && setFailed(true));
    // Nettoyage : on libère la mémoire occupée par l'image
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, load]);

  if (failed || !url) {
    return (
      <div className={cx("flex items-center justify-center bg-canvas text-muted", className)} aria-label={alt}>
        {failed ? <ImageOff className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- image locale (blob:), next/image ne s'applique pas
  return <img src={url} alt={alt} className={cx("object-cover", className)} />;
}
