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
async function openAiCompatible(url, apiKey, model, system, prompt) {
  const data = await postJson(
    url,
    {
      model,
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
    { Authorization: `Bearer ${apiKey}` },
  );
  return data.choices?.[0]?.message?.content;
}

async function gemini(apiKey, model, system, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const data = await postJson(
    url,
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    },
    { "x-goog-api-key": apiKey },
  );
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
}

// Chaque fournisseur reçoit (provider en base, system, prompt) et renvoie du texte
export const LLM_CALLERS = {
  groq: (p, system, prompt) =>
    openAiCompatible(
      "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY,
      p.model || "llama-3.3-70b-versatile",
      system,
      prompt,
    ),
  gemini: (p, system, prompt) =>
    gemini(process.env.GEMINI_API_KEY, p.model || "gemini-2.0-flash", system, prompt),
  openrouter: (p, system, prompt) =>
    openAiCompatible(
      "https://openrouter.ai/api/v1/chat/completions",
      process.env.OPENROUTER_API_KEY,
      p.model || "meta-llama/llama-3.3-70b-instruct:free",
      system,
      prompt,
    ),
};

export const hasApiKey = (provider) => !provider.envKey || Boolean(process.env[provider.envKey]);
