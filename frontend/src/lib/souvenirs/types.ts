/**
 * Types TypeScript du module Souvenirs (F4).
 * Ils reflètent exactement ce que renvoie l'API backend :
 * voir backend/src/models/souvenirs/Memory.js et backend/src/services/souvenirs/stats.service.js
 */

/** Une personne présente dans le souvenir (ex. { name: "Leïla", relation: "sœur" }) */
export interface MemoryPerson {
  name: string;
  relation?: string;
}

/** Une question du quiz, générée par l'IA (ou par le générateur local de secours) */
export interface MemoryQuestion {
  question: string;
  answer: string;
  /** Deux indices, du plus vague au plus précis : jamais « c'est faux » */
  hints: string[];
}

/** Photo d'un souvenir (le fichier est servi par GET /souvenirs/:id/photos/:photoId) */
export interface MemoryPhotoInfo {
  _id: string;
  mime: string;
  size?: number;
  uploadedAt: string;
}

/** valide : visible côté senior · a_valider : raconté par le senior, en attente de relecture */
export type MemoryStatus = "valide" | "a_valider";
/** Qui a créé le souvenir */
export type MemorySource = "aidant" | "senior";

export interface Memory {
  _id: string;
  senior: string;
  title: string;
  date?: string;
  place?: string;
  people: MemoryPerson[];
  story?: string;
  /** Photos montrées au senior pendant l'écoute (6 au maximum) */
  photos: MemoryPhotoInfo[];
  source: MemorySource;
  status: MemoryStatus;
  validatedAt?: string;
  /** true : masqué pour le senior (reste visible et modifiable par l'aidant) */
  hidden: boolean;
  /** Texte de l'enregistrement du senior (speech-to-text), si source = "senior" */
  transcription?: string;
  audio?: { fileId?: string; mime?: string; durationSec?: number };
  /** Récit et quiz mis en cache après génération */
  generated?: {
    recit: string;
    questions: MemoryQuestion[];
    provider: string;
    fallback: boolean;
    generatedAt: string;
  };
  listenCount: number;
  lastListenedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Nouvelle version proposée par l'IA, pas encore enregistrée (POST /souvenirs/:id/regenerer) */
export interface MemoryProposal {
  recit: string;
  questions: MemoryQuestion[];
  provider: string;
  fallback: boolean;
}

/** Ce que le formulaire de l'aidant envoie à l'API */
export interface MemoryInput {
  title: string;
  date: string;
  place: string;
  people: MemoryPerson[];
  story: string;
}

/** Statistiques du tableau de bord (GET /souvenirs/stats) */
export interface MemoryStats {
  periodDays: number;
  memories: { total: number; pending: number; toldBySenior: number };
  listened: number;
  quizzes: {
    played: number;
    answered: number;
    withoutHint: number;
    withHint: number;
    given: number;
    skipped: number;
  };
  daily: { date: string; listened: number; answered: number }[];
  /** Détail des 5 dernières parties : question, réponse dite par le senior, résultat */
  recentQuizzes: {
    _id: string;
    memoryTitle: string;
    createdAt: string;
    answers: { question?: string; given?: string; result: QuizResult }[];
  }[];
}

/** Résultat d'une question : trouvée seul, avec 1 ou 2 indices, racontée par l'assistant, ou passée */
export type QuizResult = "sans_indice" | "un_indice" | "deux_indices" | "donnee" | "passee";
