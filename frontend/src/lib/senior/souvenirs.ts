/**
 * Appels API du module Souvenirs pour l'interface Senior (jeton senior).
 * Le senior ne reçoit que les souvenirs validés par l'aidant et non masqués.
 */
import { API_URL } from "@/lib/api";
import { seniorFetch, seniorToken } from "./api";

/** Un souvenir dans la liste « Écouter » */
export interface SeniorMemoryItem {
  _id: string;
  title: string;
  date?: string;
  place?: string;
  photosCount: number;
}

/** Un souvenir prêt à être écouté */
export interface SeniorMemory extends SeniorMemoryItem {
  recit: string;
  photos: { _id: string }[];
}

export type ChooseResult = { status: "trouve"; memoryId: string } | { status: "ambigu"; candidates: string[] } | { status: "aucun" };

export const fetchMemories = () => seniorFetch<{ memories: SeniorMemoryItem[] }>("/senior/souvenirs");

export const fetchMemory = (id: string) => seniorFetch<{ memory: SeniorMemory }>(`/senior/souvenirs/${id}`);

/** Retrouve le souvenir demandé à voix haute (ids = souvenirs affichés, dans l'ordre de l'écran) */
export const chooseMemory = (text: string, ids: string[]) =>
  seniorFetch<ChooseResult>("/senior/souvenirs/choisir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ids }),
  });

/* ---------- Photos et écoute ---------- */


/** Adresse API d'une photo du souvenir (côté senior) */
export const seniorPhotoPath = (memoryId: string, photoId: string) => `/senior/souvenirs/${memoryId}/photos/${photoId}`;

/** Télécharge une photo avec le jeton du senior et renvoie une adresse locale (blob:) pour <img> */
export async function fetchSeniorPhotoUrl(path: string): Promise<string> {
  const token = seniorToken.get();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Photo indisponible");
  return URL.createObjectURL(await res.blob());
}

/** Signale que le récit a été écouté jusqu'au bout (statistiques de l'aidant) */
export const markListened = (memoryId: string) => seniorFetch<void>(`/senior/souvenirs/${memoryId}/ecoute`, { method: "POST" }).catch(() => {});

/* ---------- Quiz ---------- */

/** Une partie commencée : les questions SANS les réponses (gardées par le serveur) */
export interface QuizStart {
  sessionId: string;
  title: string;
  questions: { question: string }[];
}

/** Ce que le serveur répond après chaque réponse du senior */
export type QuizOutcome =
  | { outcome: "correct"; answer: string }
  | { outcome: "indice"; hint: string; proche: boolean }
  | { outcome: "donnee"; answer: string }
  | { outcome: "passee"; answer: string };

const postJson = <T>(path: string, body?: unknown) =>
  seniorFetch<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const startQuiz = (memoryId: string) => postJson<QuizStart>(`/senior/souvenirs/${memoryId}/quiz`);

/** attempt : 0 = premier essai, 1 = après l'indice 1, 2 = après l'indice 2 */
export const answerQuiz = (sessionId: string, questionIndex: number, text: string, attempt: number) =>
  postJson<QuizOutcome>(`/senior/souvenirs/quiz/${sessionId}/reponse`, { questionIndex, text, attempt });

export const finishQuiz = (sessionId: string) => postJson<{ total: number; found: number }>(`/senior/souvenirs/quiz/${sessionId}/fin`);
