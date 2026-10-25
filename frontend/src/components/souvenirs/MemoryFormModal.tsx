"use client";

/**
 * Formulaire d'un souvenir, utilisé dans trois situations :
 *  - "create"   : l'aidant ajoute un nouveau souvenir ;
 *  - "edit"     : l'aidant corrige un souvenir existant ;
 *  - "validate" : l'aidant relit un souvenir raconté par le senior (transcription affichée),
 *                 le corrige si besoin, puis le valide pour qu'il apparaisse côté senior.
 * Dans les trois cas, l'enregistrement déclenche la génération du récit et du quiz par l'IA.
 *
 * Photos : l'aidant peut joindre jusqu'à 6 photos, montrées au senior pendant l'écoute.
 * Elles sont réduites dans le navigateur, puis envoyées une par une APRÈS l'enregistrement
 * du souvenir (il faut d'abord que le souvenir existe pour y rattacher ses photos).
 */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { Button, ErrorBox, Field, Input, Modal, Spinner, Textarea } from "@/components/ui";
import { MAX_PHOTOS, memoryApi, photoPath, removePhoto, uploadPhoto } from "@/lib/souvenirs/api";
import { resizeImage } from "@/lib/souvenirs/resizeImage";
import type { Memory, MemoryInput, MemoryPerson } from "@/lib/souvenirs/types";
import { MemoryPhoto } from "./MemoryPhoto";

type Mode = "create" | "edit" | "validate";

const TITLES: Record<Mode, string> = {
  create: "Nouveau souvenir",
  edit: "Modifier le souvenir",
  validate: "Relire et valider le souvenir",
};

/** Photo choisie dans le formulaire mais pas encore envoyée */
interface NewPhoto {
  file: File;
  preview: string; // adresse locale blob: pour l'aperçu
}

export function MemoryFormModal({
  base,
  mode,
  memory,
  onClose,
  onSaved,
}: {
  base: string;
  mode: Mode;
  memory?: Memory;
  onClose: () => void;
  onSaved: (memory: Memory) => void;
}) {
  // État du formulaire, pré-rempli avec le souvenir existant (modification ou validation)
  const [form, setForm] = useState<MemoryInput>({
    title: memory?.title ?? "",
    date: memory?.date ?? "",
    place: memory?.place ?? "",
    people: memory?.people?.length ? memory.people : [{ name: "", relation: "" }],
    // Un seul récit : le formulaire affiche exactement le texte du livre (récit lu au senior)
    story: memory?.generated?.recit ?? memory?.story ?? "",
  });
  // Photos déjà enregistrées, photos à supprimer, nouvelles photos à envoyer
  const [keptPhotos, setKeptPhotos] = useState(memory?.photos ?? []);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  // Une fois le souvenir créé, on garde son id : un nouvel essai le met à jour au lieu d'en créer un second
  const [savedId, setSavedId] = useState<string | undefined>(memory?._id);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(""); // texte du bouton pendant l'enregistrement
  const fileInput = useRef<HTMLInputElement>(null);

  // Libère les aperçus locaux quand la fenêtre se ferme
  const previews = useRef<string[]>([]);
  previews.current = newPhotos.map((p) => p.preview);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Modification ou validation : on relit le souvenir depuis le serveur avant d'afficher le
  // formulaire, pour partir de la dernière version enregistrée (ex. reformulation acceptée dans le livre)
  const [loadingFresh, setLoadingFresh] = useState(Boolean(memory));
  useEffect(() => {
    if (!memory) return;
    memoryApi
      .get(base, memory._id)
      .then(({ memory: fresh }) => {
        setForm({
          title: fresh.title,
          date: fresh.date ?? "",
          place: fresh.place ?? "",
          people: fresh.people?.length ? fresh.people : [{ name: "", relation: "" }],
          story: fresh.generated?.recit ?? fresh.story ?? "",
        });
        setKeptPhotos(fresh.photos ?? []);
      })
      .catch(() => {}) // en cas d'échec, on garde la version de la liste
      .finally(() => setLoadingFresh(false));
  }, [base, memory]);

  const photoCount = keptPhotos.length + newPhotos.length;

  // Met à jour une personne de la liste (nom ou lien de parenté)
  const setPerson = (i: number, patch: Partial<MemoryPerson>) =>
    setForm({ ...form, people: form.people.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  // Photos choisies avec le sélecteur de fichiers
  function addFiles(files: FileList | null) {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photoCount;
    if (images.length > room) setError(`${MAX_PHOTOS} photos au maximum : seules les ${room} premières ont été ajoutées.`);
    setNewPhotos((cur) => [...cur, ...images.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (fileInput.current) fileInput.current.value = ""; // permet de rechoisir la même photo
  }

  async function save() {
    if (!form.title.trim()) return setError("Le titre est obligatoire.");
    setSaving(true);
    setError("");
    try {
      // 1. Enregistrer le souvenir (le backend génère le récit et le quiz)
      setStep("L'IA prépare le récit…");
      const payload = { ...form, people: form.people.filter((p) => p.name.trim()) };
      let saved: Memory;
      if (mode === "validate") saved = (await memoryApi.validate(base, memory!._id, payload)).memory;
      else if (savedId) saved = (await memoryApi.update(base, savedId, payload)).memory;
      else saved = (await memoryApi.create(base, payload)).memory;
      setSavedId(saved._id);

      // 2. Supprimer les photos retirées par l'aidant
      for (const id of removedIds) await removePhoto(base, saved._id, id);
      setRemovedIds([]);

      // 3. Réduire puis envoyer les nouvelles photos, une par une
      for (let i = 0; i < newPhotos.length; i++) {
        setStep(`Envoi des photos (${i + 1}/${newPhotos.length})…`);
        saved = await uploadPhoto(base, saved._id, await resizeImage(newPhotos[i].file));
      }

      onSaved(saved);
      onClose();
    } catch (err) {
      // Le souvenir peut déjà être enregistré : un nouveau clic reprendra là où ça s'est arrêté
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={TITLES[mode]}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} loading={saving} disabled={loadingFresh}>
            {saving ? step : mode === "validate" ? "Valider le souvenir" : "Enregistrer"}
          </Button>
        </>
      }
    >
      {loadingFresh ? (
        <Spinner label="Chargement du souvenir…" />
      ) : (
      <div className="space-y-4">
        {/* Validation : on montre d'abord ce que le senior a dit, pour aider l'aidant à corriger */}
        {mode === "validate" && memory?.transcription && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-500">Ce que le senior a raconté (transcription)</p>
            <p className="mt-1.5 text-[15px] italic text-ink">« {memory.transcription} »</p>
          </div>
        )}

        <Field label="Titre du souvenir">
          {(id) => <Input id={id} placeholder="Mariage de Marie et Ahmed" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date ou époque" hint="Texte libre : « été 1972 », « années 80 »…">
            {(id) => <Input id={id} placeholder="été 1972" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
          </Field>
          <Field label="Lieu">{(id) => <Input id={id} placeholder="Sousse" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />}</Field>
        </div>

        {/* Liste dynamique des personnes : on peut en ajouter ou en retirer */}
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">Personnes présentes</p>
          <div className="space-y-2">
            {form.people.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label={`Prénom de la personne ${i + 1}`} placeholder="Prénom" value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} />
                <Input aria-label={`Lien avec le senior, personne ${i + 1}`} placeholder="Lien (mari, sœur…)" value={p.relation ?? ""} onChange={(e) => setPerson(i, { relation: e.target.value })} />
                {form.people.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, people: form.people.filter((_, j) => j !== i) })}
                    className="rounded-lg p-2 text-muted hover:bg-danger-50 hover:text-danger-600"
                    aria-label="Retirer cette personne"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setForm({ ...form, people: [...form.people, { name: "", relation: "" }] })}>
            <Plus className="h-4 w-4" /> Ajouter une personne
          </Button>
        </div>

        <Field label="Récit du souvenir" hint="C'est ce texte qui est lu au senior. Laissez vide pour qu'il soit écrit à partir des informations ci-dessus.">
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              maxLength={6000}
              placeholder="Fête dans le jardin de la maison familiale, Leïla a chanté…"
              value={form.story}
              onChange={(e) => setForm({ ...form, story: e.target.value })}
            />
          )}
        </Field>
        {/* Compteur : prévient l'aidant avant que la limite ne coupe son texte */}
        <p className="-mt-3 text-right text-xs text-muted">{form.story.length} / 6000 caractères</p>

        {/* Photos : montrées au senior pendant qu'il écoute le souvenir */}
        <div>
          <p className="text-sm font-bold text-ink">
            Photos <span className="font-semibold text-muted">({photoCount}/{MAX_PHOTOS})</span>
          </p>
          <p className="mb-2 text-xs text-muted">Elles s&apos;afficheront en grand pendant que le souvenir est raconté au senior.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {/* Photos déjà enregistrées */}
            {keptPhotos.map((p, i) => (
              <div key={p._id} className="relative aspect-square overflow-hidden rounded-xl border border-line">
                <MemoryPhoto path={photoPath(base, savedId!, p._id)} alt={`Photo ${i + 1} du souvenir`} className="h-full w-full" />
                <RemoveButton
                  label={`Retirer la photo ${i + 1}`}
                  onClick={() => {
                    setKeptPhotos((cur) => cur.filter((x) => x._id !== p._id));
                    setRemovedIds((cur) => [...cur, p._id]);
                  }}
                />
              </div>
            ))}
            {/* Nouvelles photos, pas encore envoyées */}
            {newPhotos.map((p, i) => (
              <div key={p.preview} className="relative aspect-square overflow-hidden rounded-xl border-2 border-dashed border-brand-300">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) */}
                <img src={p.preview} alt={`Nouvelle photo ${i + 1}`} className="h-full w-full object-cover" />
                <RemoveButton
                  label={`Retirer la nouvelle photo ${i + 1}`}
                  onClick={() => {
                    URL.revokeObjectURL(p.preview);
                    setNewPhotos((cur) => cur.filter((x) => x.preview !== p.preview));
                  }}
                />
              </div>
            ))}
            {/* Bouton d'ajout (caché quand le maximum est atteint) */}
            {photoCount < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs font-bold text-brand-600 hover:border-brand-300 hover:bg-brand-50"
              >
                <ImagePlus className="h-6 w-6" />
                Ajouter
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </div>

        <ErrorBox>{error}</ErrorBox>
      </div>
      )}
    </Modal>
  );
}

// Petit bouton « × » en haut à droite d'une vignette
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
