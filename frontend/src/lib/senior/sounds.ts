/**
 * Petits signaux sonores (« earcons ») pour que le senior sache quand l'assistant l'écoute :
 *  - début d'écoute : deux notes qui MONTENT (« à vous de parler ») ;
 *  - fin d'écoute   : deux notes qui DESCENDENT (« c'est noté »).
 * Générés par le navigateur (Web Audio API) : aucun fichier son, aucune installation.
 */

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

// Joue une suite de notes douces ; la promesse se termine quand le son est fini
function playNotes(freqs: number[], noteMs = 120, volume = 0.18): Promise<void> {
  try {
    const ac = audio();
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const start = ac.currentTime + 0.02;
    freqs.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + (i * noteMs) / 1000;
      // Attaque et extinction progressives : un son doux, sans « clic »
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteMs / 1000);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + noteMs / 1000 + 0.02);
    });
    return new Promise((resolve) => setTimeout(resolve, freqs.length * noteMs + 60));
  } catch {
    return Promise.resolve(); // pas de son possible : on continue sans
  }
}

/** « À vous ! » : l'assistant commence à écouter */
export const playListenStart = () => playNotes([660, 880]);
/** « C'est noté » : l'assistant a fini d'écouter */
export const playListenStop = () => playNotes([880, 587]);
