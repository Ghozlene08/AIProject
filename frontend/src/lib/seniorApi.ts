// Client de l'API de l'espace Senior (session séparée de celle des aidants et administrateurs)
import { API_URL } from "./api";

// Session du senior : helper commun de l'équipe (lib/senior/api.ts, même clé « sa_senior_token »)
import { seniorToken } from "./senior/api";
export { seniorToken };

export class SeniorApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw?: { blob: Blob }): Promise<T> {
  const token = seniorToken.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/senior${path}`, {
      method,
      headers: {
        ...(raw ? { "Content-Type": raw.blob.type || "audio/webm" } : body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: raw ? raw.blob : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SeniorApiError(0, "Je n'arrive pas à joindre le serveur. Vérifiez votre connexion.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && path !== "/pair") {
      seniorToken.clear();
      window.dispatchEvent(new Event("sa:senior-logout"));
    }
    throw new SeniorApiError(res.status, data.message ?? `Erreur ${res.status}`, data);
  }
  return data as T;
}

export const seniorApi = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
  audio: <T>(path: string, blob: Blob) => request<T>("POST", path, undefined, { blob }),
};

/* ---------- Types ---------- */

export interface AgendaItem {
  kind: "prise" | "evenement";
  id: string;
  at: string;
  time: string;
  title: string;
  detail: string | null;
  note: string | null;
  type?: "rdv" | "repas" | "activite" | "rappel" | "autre";
  createdBy?: "aidant" | "senior" | "ia";
  status: "a_venir" | "confirme" | "manque" | "prevu" | "fait";
}

export interface Proposal {
  title: string;
  date: string;
  time: string;
  type: "rappel" | "rdv" | "repas";
}

export interface VoiceResponse {
  status: "answer" | "confirmation" | "clarification";
  intent?: string;
  speech: string;
  date?: string;
  items?: AgendaItem[];
  proposal?: Proposal;
  context?: { title: string; date: string | null; type: string };
  event?: unknown;
}

export interface Reminder {
  kind: "prise" | "evenement";
  id: string;
  time: string;
  title: string;
  detail: string;
  speech: string;
}
