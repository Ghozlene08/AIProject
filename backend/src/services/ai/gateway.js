import { AiCall, AiProvider, PlatformSettings } from "../../models/index.js";
import { createAnonymizer } from "./anonymizer.js";
import { validateOutput } from "./validator.js";
import { LLM_CALLERS, hasApiKey } from "./providers.js";

/**
 * Passerelle IA : anonymise → essaie les fournisseurs par priorité → valide → journalise.
 * Si aucun fournisseur n'est disponible (clé absente, quota, panne), le générateur
 * local `localFallback` produit une réponse : le senior ne voit jamais d'erreur.
 */
export async function generateText({ task, system, prompt, names = [], seniorId, localFallback, maxTokens }) {
  const anon = createAnonymizer(names);
  const safePrompt = anon.anonymize(prompt);
  const safeSystem = anon.anonymize(system);

  const [providers, settings] = await Promise.all([
    AiProvider.find({ capability: "llm", enabled: true }).sort({ priority: 1 }),
    PlatformSettings.get(),
  ]);
  // Confidentialité : l'aperçu du prompt (déjà anonymisé) n'est conservé que si l'admin l'autorise
  const preview = settings.privacy.storePromptPreview ? safePrompt.slice(0, 600) : undefined;
  let attempt = 0;

  for (const provider of providers) {
    const caller = LLM_CALLERS[provider.key];
    if (!caller) continue;
    // Fournisseur non configuré : on passe au suivant sans le compter comme une panne
    if (!provider.simulateFailure && !hasApiKey(provider)) continue;

    const started = Date.now();
    try {
      if (provider.simulateFailure) throw new Error("Panne simulée par l'administrateur");
      const raw = await caller(provider, safeSystem, safePrompt, maxTokens);
      const text = validateOutput(anon.deanonymize(raw));
      await log({ task, provider, status: "succes", started, attempt, preview, anon, seniorId });
      return { text, provider: provider.name, fallback: attempt > 0 };
    } catch (err) {
      await log({ task, provider, status: "erreur", started, attempt, preview, anon, seniorId, error: err.message });
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
    preview,
    anon,
    seniorId,
  });
  return { text, provider: "Générateur local", fallback: true };
}

function log({ task, provider, status, started, attempt, preview, anon, seniorId, error }) {
  return AiCall.create({
    task,
    capability: "llm",
    provider: provider.name,
    model: provider.model,
    status,
    fallback: attempt > 0,
    latencyMs: Date.now() - started,
    promptPreview: preview,
    tokens: anon.tokens(),
    error,
    senior: seniorId,
  });
}
