// Appels HTTP vers les fournisseurs LLM gratuits (format « chat »)

const TIMEOUT_MS = 12000;

async function postJson(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || res.statusText;
    throw new Error(`HTTP ${res.status} : ${msg}`);
  }
  return data;
}

// API compatible OpenAI (Groq, OpenRouter)
async function openAiCompatible(url, apiKey, model, system, prompt, maxTokens = 700) {
  const data = await postJson(
    url,
    {
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      // Modèles à raisonnement (gpt-oss) : effort réduit pour tenir l'objectif de latence < 4 s
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
    { Authorization: `Bearer ${apiKey}` },
  );
  return data.choices?.[0]?.message?.content;
}

async function gemini(apiKey, model, system, prompt, maxTokens = 700) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const data = await postJson(
    url,
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // Réflexion désactivée : ~3 s au lieu de ~5 s (mesuré), compatible avec l'objectif de latence
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    },
    { "x-goog-api-key": apiKey },
  );
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
}

// Chaque fournisseur reçoit (provider en base, system, prompt, maxTokens) et renvoie du texte
export const LLM_CALLERS = {
  groq: (p, system, prompt, maxTokens) =>
    openAiCompatible(
      "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY,
      p.model || "openai/gpt-oss-120b",
      system,
      prompt,
      maxTokens,
    ),
  gemini: (p, system, prompt, maxTokens) =>
    gemini(process.env.GEMINI_API_KEY, p.model || "gemini-flash-latest", system, prompt, maxTokens),
  openrouter: (p, system, prompt, maxTokens) =>
    openAiCompatible(
      "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY,
      p.model || "google/gemma-4-31b-it:free",
      system,
      prompt,
      maxTokens,
    ),
};

export const hasApiKey = (provider) => !provider.envKey || Boolean(process.env[provider.envKey]);
