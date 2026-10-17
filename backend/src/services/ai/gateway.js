import { AiCall, AiProvider } from "../../models/index.js";
import { createAnonymizer } from "./anonymizer.js";
import { validateOutput } from "./validator.js";
import { LLM_CALLERS, hasApiKey } from "./providers.js";

/**
 * Passerelle IA : anonymise → essaie les fournisseurs par priorité → valide → journalise.
 * Si aucun fournisseur n'est disponible (clé absente, quota, panne), le générateur
 * local `localFallback` produit une réponse : le senior ne voit jamais d'erreur.
 */
export async function generateText({ task, system, prompt, names = [], seniorId, localFallback }) {
  const anon = createAnonymizer(names);
  const safePrompt = anon.anonymize(prompt);
  const safeSystem = anon.anonymize(system);

  const providers = await AiProvider.find({ capability: "llm", enabled: true }).sort({ priority: 1 });
  let attempt = 0;

  for (const provider of providers) {
    const caller = LLM_CALLERS[provider.key];
    if (!caller) continue;
    // Fournisseur non configuré : on passe au suivant sans le compter comme une panne
    if (!provider.simulateFailure && !hasApiKey(provider)) continue;

    const started = Date.now();
    try {
      if (provider.simulateFailure) throw new Error("Panne simulée par l'administrateur");
      const raw = await caller(provider, safeSystem, safePrompt);
      const text = validateOutput(anon.deanonymize(raw));
      await log({ task, provider, status: "succes", started, attempt, safePrompt, anon, seniorId });
      return { text, provider: provider.name, fallback: attempt > 0 };
    } catch (err) {
      await log({ task, provider, status: "erreur", started, attempt, safePrompt, anon, seniorId, error: err.message });
      attempt += 1;
    }
  }

  // Dernier recours : génération locale à partir des données (aucun appel externe)
  const started = Date.now();
  const text = validateOutput(localFallback());
  await log({
    task,
    provider: { name: "Générateur local", model: "modele-regles" },
    status: "succes",
    started,
    attempt: Math.max(attempt, 1),
    safePrompt,
    anon,
    seniorId,
  });
  return { text, provider: "Générateur local", fallback: true };
}

function log({ task, provider, status, started, attempt, safePrompt, anon, seniorId, error }) {
  return AiCall.create({
    task,
    capability: "llm",
    provider: provider.name,
    model: provider.model,
    status,
    fallback: attempt > 0,
    latencyMs: Date.now() - started,
    promptPreview: safePrompt.slice(0, 600),
    tokens: anon.tokens(),
    error,
    senior: seniorId,
  });
}
