"use client";

/**
 * Carte d'un souvenir dans la liste de l'aidant : titre, date, lieu, personnes,
 * statut, interrupteur « visible par le senior » et actions (voir, modifier, valider, supprimer).
 */
import { BookOpen, Camera, CheckCircle2, EyeOff, Headphones, MapPin, Mic, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, Card, Toggle, cx } from "@/components/ui";
import { fmtShort } from "@/lib/format";
import { photoPath } from "@/lib/souvenirs/api";
import type { Memory } from "@/lib/souvenirs/types";
import { MemoryPhoto } from "./MemoryPhoto";

export function MemoryCard({
  base,
  memory,
  onView,
  onEdit,
  onValidate,
  onToggleVisibility,
  onDelete,
}: {
  /** Préfixe des routes API du senior (pour charger les photos) */
  base: string;
  memory: Memory;
  onView: () => void;
  onEdit: () => void;
  onValidate: () => void;
  /** Appelé avec la nouvelle valeur : true = masquer pour le senior */
  onToggleVisibility: (hidden: boolean) => void;
  onDelete: () => void;
}) {
  const pending = memory.status === "a_valider";
  const hidden = !pending && memory.hidden;

  return (
    // Bordure violette : à valider · carte grisée : masquée pour le senior
    <Card className={cx("p-5", pending && "border-violet-300", hidden && "bg-slate-50")}>
      {/* Vignette : la première photo du souvenir */}
      {memory.photos.length > 0 && (
        <div className={cx("relative -mx-5 -mt-5 mb-4 h-36 overflow-hidden rounded-t-2xl", hidden && "opacity-60")}>
          <MemoryPhoto path={photoPath(base, memory._id, memory.photos[0]._id)} alt={`Photo du souvenir ${memory.title}`} className="h-full w-full" />
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
            <Camera className="h-3 w-3" /> {memory.photos.length}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className={cx("min-w-0", hidden && "opacity-60")}>
          <h3 className="truncate text-[16px] font-extrabold text-ink">{memory.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {memory.date && <span>{memory.date}</span>}
            {memory.place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {memory.place}
              </span>
            )}
          </p>
        </div>
        {/* Badges de statut */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {pending ? (
            <Badge tone="violet">À valider</Badge>
          ) : hidden ? (
            <Badge tone="muted">
              <EyeOff className="h-3 w-3" /> Masqué pour le senior
            </Badge>
          ) : (
            <Badge tone="ok">Visible par le senior</Badge>
          )}
          {memory.source === "senior" && (
            <Badge tone="muted">
              <Mic className="h-3 w-3" /> Raconté par le senior
            </Badge>
          )}
        </div>
      </div>

      {/* Personnes présentes */}
      {memory.people.length > 0 && (
        <div className={cx("mt-3 flex flex-wrap gap-1.5", hidden && "opacity-60")}>
          {memory.people.map((p) => (
            <Badge key={`${p.name}-${p.relation}`}>
              {p.name}
              {p.relation && <span className="font-semibold opacity-70">· {p.relation}</span>}
            </Badge>
          ))}
        </div>
      )}

      {/* Aperçu du texte : transcription si raconté par le senior, sinon le récit saisi */}
      <p className={cx("mt-3 line-clamp-2 text-sm text-muted", hidden && "opacity-60")}>
        {pending ? memory.transcription : memory.story || memory.generated?.recit}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {pending ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Mic className="h-3.5 w-3.5" /> Raconté le {fmtShort(memory.createdAt)}
          </span>
        ) : (
          // Interrupteur : masquer / démasquer le souvenir pour le senior (sans le supprimer)
          <div className="flex items-center gap-2">
            <Toggle
              label={hidden ? `Démasquer « ${memory.title} » pour le senior` : `Masquer « ${memory.title} » pour le senior`}
              checked={!hidden}
              onChange={(visible) => onToggleVisibility(!visible)}
            />
            <span className="text-xs font-semibold text-muted">{hidden ? "Masqué" : "Visible"}</span>
            {memory.listenCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted">
                <Headphones className="h-3.5 w-3.5" /> {memory.listenCount}×
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          {pending ? (
            <Button size="sm" onClick={onValidate}>
              <CheckCircle2 className="h-4 w-4" /> Relire et valider
            </Button>
          ) : (
            <>
              <button onClick={onView} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`Voir le récit et le quiz de ${memory.title}`}>
                <BookOpen className="h-4 w-4" />
              </button>
              <button onClick={onEdit} className="rounded-lg p-2 text-muted hover:bg-brand-50 hover:text-brand-700" aria-label={`Modifier ${memory.title}`}>
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}
          <button onClick={onDelete} className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600" aria-label={`Supprimer ${memory.title}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
