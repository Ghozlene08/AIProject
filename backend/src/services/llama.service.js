
const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "llama3.2";

export async function analyzeRiskData(alertSummary) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: `
You are an AI assistant for a senior assistance application.

Analyze only the facts explicitly provided in the input data.

STRICT RULES:
1. Never invent events, symptoms, causes, caregiver responses,
   or actions by emergency services.
2. Distinguish recorded facts from unknown information.
3. A recorded SOS alert does not prove the senior's current
   condition or confirm a separate emergency for every alert.
4. The severity field reflects the database classification;
   it is not an independent medical assessment.
5. Do not diagnose medical conditions or assign unsupported
   risk scores.
6. Do not claim that a caregiver was contacted or that an
   emergency workflow was activated unless the data confirms it.
7. If SOS alerts exist, recommend that the caregiver check
   the latest alert and verify the senior's current condition
   through the established emergency workflow.
8. Never replace, delay, or cancel the existing SOS workflow.
9. If information is missing, explicitly say it is unknown.
10. If no alerts are recorded, do not conclude that the senior
    is safe.

Return these sections:
- Recorded facts
- What remains unknown
- Recommended caregiver actions

Use concise, clear language.
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify(alertSummary),
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }

  const result = await response.json();

  return {
    model: OLLAMA_MODEL,
    analysis: result.message?.content ?? "",
  };
}
