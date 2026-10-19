/**
 * Appels à l'API du module Souvenirs.
 * Toutes les routes sont sous /aidant/seniors/:seniorId/souvenirs ;
 * `base` vaut "/aidant/seniors/<id du senior sélectionné>" (fourni par useCurrentSenior()).
 * Le jeton JWT est ajouté automatiquement par le client `api` partagé.
 */
import { API_URL, ApiError, api, qs, tokenStore } from "@/lib/api";
import type { Memory, MemoryInput, MemoryProposal, MemoryStatus } from "./types";

type One = { memory: Memory };

export const memoryPaths = {
  /** Liste des souvenirs, éventuellement filtrée par statut */
  list: (base: string, status?: MemoryStatus) => `${base}/souvenirs${qs({ status })}`,
  /** Statistiques sur N jours (7 par défaut) */
  stats: (base: string, days = 7) => `${base}/souvenirs/stats${qs({ days })}`,
};

export const memoryApi = {
  /** Relit un souvenir depuis le serveur (version enregistrée la plus récente) */
  get: (base: string, id: string) => api.get<One>(`${base}/souvenirs/${id}`),
  /** Crée un souvenir : le backend génère aussitôt le récit et le quiz (quelques secondes) */
  create: (base: string, input: MemoryInput) => api.post<One>(`${base}/souvenirs`, input),
  /** Modifie un souvenir : si un fait change, le récit et le quiz sont régénérés */
  update: (base: string, id: string, input: Partial<MemoryInput>) => api.put<One>(`${base}/souvenirs/${id}`, input),
  /** Valide un souvenir raconté par le senior (avec les corrections éventuelles de l'aidant) */
  validate: (base: string, id: string, input?: Partial<MemoryInput>) => api.patch<One>(`${base}/souvenirs/${id}/valider`, input),
  /** Masque (hidden = true) ou démasque (false) le souvenir pour le senior */
  setVisibility: (base: string, id: string, hidden: boolean) => api.patch<One>(`${base}/souvenirs/${id}/visibilite`, { hidden }),
  /** Demande une PROPOSITION de nouveau récit et quiz : rien n'est enregistré */
  propose: (base: string, id: string) => api.post<{ proposal: MemoryProposal }>(`${base}/souvenirs/${id}/regenerer`),
  /** L'aidant accepte la proposition : elle remplace la version enregistrée */
  acceptProposal: (base: string, id: string, proposal: MemoryProposal) => api.put<One>(`${base}/souvenirs/${id}/recit`, proposal),
  /** Supprime définitivement un souvenir */
  remove: (base: string, id: string) => api.del(`${base}/souvenirs/${id}`),
};

/* ---------- Photos ----------
 * Le client `api` partagé ne sait envoyer que du JSON : pour une image, on utilise fetch
 * directement, en ajoutant nous-mêmes le jeton JWT. */

export const MAX_PHOTOS = 6;

/** Adresse API d'une photo (à charger avec fetchPhotoUrl, car <img src> n'envoie pas le jeton) */
export const photoPath = (base: string, memoryId: string, photoId: string) => `${base}/souvenirs/${memoryId}/photos/${photoId}`;

/** Envoie une photo (déjà réduite par resizeImage) et renvoie le souvenir mis à jour */
export async function uploadPhoto(base: string, memoryId: string, image: Blob): Promise<Memory> {
  const token = tokenStore.get();
  const res = await fetch(`${API_URL}${base}/souvenirs/${memoryId}/photos`, {
    method: "POST",
    headers: { "Content-Type": image.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: image,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? "La photo n'a pas pu être envoyée");
  return data.memory;
}

/** Supprime une photo du souvenir */
export const removePhoto = (base: string, memoryId: string, photoId: string) => api.del(photoPath(base, memoryId, photoId));

/**
 * Télécharge une photo avec le jeton JWT et renvoie une adresse locale (blob:…)
 * utilisable dans <img src>. Penser à appeler URL.revokeObjectURL() ensuite.
 */
export async function fetchPhotoUrl(path: string): Promise<string> {
  const token = tokenStore.get();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Photo indisponible");
  return URL.createObjectURL(await res.blob());
}
