/**
 * Client API de l'interface Senior.
 * Le senior a son propre jeton (rôle "senior"), rangé à part de celui de l'aidant :
 * on peut ainsi être connecté en aidant dans un onglet et en senior dans un autre.
 *
 * ⚠️ TEMPORAIRE : tant que la connexion du senior (code + PIN / reconnaissance faciale)
 * n'est pas terminée par l'équipe, ensureSeniorSession() ouvre une session de démonstration
 * pour Marie (code MARIE7). Il suffira ensuite d'appeler seniorToken.set(jeton) après la connexion.
 */
import { API_URL, ApiError } from "@/lib/api";

const KEY = "sa_senior_token";
const PROFILE_KEY = "sa_senior_profile";
const DEMO_PAIRING_CODE = "MARIE7";

export const seniorToken = {
  get: () => (typeof window === "undefined" ? null : window.localStorage.getItem(KEY)),
  set: (t: string) => window.localStorage.setItem(KEY, t),
  clear: () => window.localStorage.removeItem(KEY),
};

export interface SeniorMe {
  _id: string;
  firstName: string;
  lastName: string;
  consentAI: boolean;
}

/** Appel à l'API avec le jeton du senior */
export async function seniorFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = seniorToken.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ApiError(0, "Le serveur est injoignable.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? `Erreur ${res.status}`);
  return data as T;
}

/** Profil gardé de la dernière visite : permet de dire « Bonjour Marie » sans attendre le serveur */
export function cachedSenior(): SeniorMe | null {
  try {
    return JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "null");
  } catch {
    return null;
  }
}
const remember = (s: SeniorMe) => {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(s));
  return s;
};

/** Garantit une session senior et renvoie le profil (prénom pour l'accueil vocal) */
export async function ensureSeniorSession(): Promise<SeniorMe> {
  if (seniorToken.get()) {
    try {
      return remember((await seniorFetch<{ senior: SeniorMe }>("/senior/moi")).senior);
    } catch (err) {
      if ((err as ApiError).status !== 401) throw err;
      seniorToken.clear(); // jeton expiré ou base recréée : on rouvre une session
    }
  }
  const { token, senior } = await seniorFetch<{ token: string; senior: SeniorMe }>("/senior/session-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode: DEMO_PAIRING_CODE }),
  });
  seniorToken.set(token);
  return remember(senior);
}

/**
 * Envoie un enregistrement au serveur pour la reconnaissance vocale (Whisper).
 * Renvoie le texte, ou null si Whisper est indisponible (le navigateur prend alors le relais).
 */
export async function speechToText(audio: Blob, { module, hint }: { module: string; hint?: string }): Promise<string | null> {
  const params = new URLSearchParams({ module, ...(hint ? { hint } : {}) });
  try {
    const { text } = await seniorFetch<{ text: string }>(`/senior/stt?${params}`, {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
    });
    return text;
  } catch {
    return null; // 503 STT_UNAVAILABLE, réseau, consentement refusé… → secours du navigateur
  }
}
