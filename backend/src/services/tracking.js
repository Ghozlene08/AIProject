import { UsageEvent } from "../models/index.js";

/**
 * Enregistre un événement d'usage. Ne bloque jamais l'action de l'utilisateur :
 * en cas d'échec d'écriture, l'erreur est seulement journalisée.
 *
 * L'interface Senior doit appeler cette fonction depuis ses routes, par exemple :
 *   trackEvent({ senior, actor: "senior", module: "agenda", action: "rappel_cree",
 *                channel: "voix", intent: "creer_rappel", step: 4, latencyMs: 2300 })
 */
export function trackEvent(event) {
  return UsageEvent.create(event).catch((err) => {
    console.warn("⚠️  Événement d'usage non enregistré :", err.message);
    return null;
  });
}
