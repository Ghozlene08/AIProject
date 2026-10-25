/**
 * Voix de l'assistant (text-to-speech) avec la synthèse vocale intégrée au navigateur.
 * Aucune installation ni clé API. Edge TTS (voix plus naturelle) sera ajouté plus tard ;
 * cette voix restera alors la solution de secours.
 */

export type SpeakResult = "ok" | "blocked" | "unsupported";

/* Compteur d'annulations : stopSpeaking() l'augmente. Une phrase demandée AVANT l'annulation
 * ne doit jamais partir APRÈS (par exemple quand le senior a déjà quitté la page). */
let generation = 0;

const isSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Préchargement : le navigateur charge ses voix dès l'ouverture de la page,
// la première question peut ainsi partir sans attendre
if (isSupported()) window.speechSynthesis.getVoices();

// Les voix se chargent parfois après l'ouverture de la page : on attend au plus 1 seconde
function frenchVoice(): Promise<SpeechSynthesisVoice | undefined> {
  const pick = () => {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang === "fr-FR" && /natural|online|google|denise|amélie|thomas/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("fr"));
  };
  const now = pick();
  if (now || window.speechSynthesis.getVoices().length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(pick());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 300);
  });
}

/**
 * Lit un texte à voix haute et attend la fin de la lecture.
 * "blocked" : le navigateur refuse de parler tant que l'utilisateur n'a pas touché la page.
 */
export async function speak(text: string, { rate = 0.9 } = {}): Promise<SpeakResult> {
  if (!isSupported()) return "unsupported";
  const myGeneration = generation;
  window.speechSynthesis.cancel(); // coupe une éventuelle phrase en cours
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = rate; // un peu plus lent que la normale, plus confortable pour une personne âgée
  utterance.voice = (await frenchVoice()) ?? null;
  // Annulée pendant le chargement de la voix (page quittée…) : on ne parle pas
  if (myGeneration !== generation) return "ok";

  return new Promise((resolve) => {
    utterance.onend = () => resolve("ok");
    utterance.onerror = (e) => resolve(e.error === "not-allowed" ? "blocked" : "ok");
    window.speechSynthesis.speak(utterance);
  });
}

/** Arrête immédiatement la voix */
export function stopSpeaking() {
  generation++;
  if (isSupported()) window.speechSynthesis.cancel();
}
