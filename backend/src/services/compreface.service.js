import { HttpError } from "../utils/httpError.js";

// Messages publics contrôlés : aucune réponse brute, clé API ou donnée faciale journalisée.
export class CompreFaceError extends HttpError {
  constructor(status, message) {
    super(status, message);
    this.expose = true;
  }
}

async function callCompreFace(path, { method = "POST", body } = {}) {
  const key = process.env.COMPREFACE_API_KEY?.trim();
  const baseUrl = (process.env.COMPREFACE_URL || "http://localhost:8000").replace(/\/$/, "");
  if (!key) throw new CompreFaceError(422, "Reconnaissance faciale non configurée. Renseignez COMPREFACE_API_KEY avec la clé d’un service Face Recognition dans backend/.env, puis redémarrez le backend.");
  let response;
  try {
    response = await fetch(`${baseUrl}/api/v1/recognition/${path}`, {
      method, headers: { "x-api-key": key }, body, signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new CompreFaceError(503, "Le service de reconnaissance faciale est inaccessible. Vérifiez que CompreFace est démarré et que COMPREFACE_URL est correcte.");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new CompreFaceError(502, "Le service de reconnaissance faciale a renvoyé une réponse invalide."); }
  if (!response.ok) {
    if (Number(data?.code) === 10 || [401, 403].includes(response.status)) {
      throw new CompreFaceError(422, "La clé CompreFace ne correspond pas à un service Face Recognition accessible. Copiez la clé de ce service dans COMPREFACE_API_KEY (backend/.env), puis redémarrez le backend.");
    }
    if ([400, 413, 422].includes(response.status)) throw new CompreFaceError(422, "La photo ne peut pas être utilisée pour la reconnaissance faciale. Choisissez une photo nette avec un seul visage visible.");
    throw new CompreFaceError(502, "Le service de reconnaissance faciale est momentanément indisponible. Réessayez plus tard.");
  }
  if (!data || typeof data !== "object") throw new CompreFaceError(502, "Réponse de reconnaissance faciale invalide.");
  return data;
}

function imageForm(imageBuffer, mimeType) {
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new CompreFaceError(400, "Image faciale absente ou format non pris en charge.");
  }
  const form = new FormData();
  form.append("file", new Blob([imageBuffer], { type: mimeType }), "face.jpg");
  return form;
}

export async function recognizeSenior(imageBuffer, mimeType = "image/jpeg") {
  const data = await callCompreFace("recognize", { body: imageForm(imageBuffer, mimeType) });
  const match = data.result?.[0]?.subjects?.[0];
  if (!match) return null;
  if (typeof match.subject !== "string" || typeof match.similarity !== "number" || !Number.isFinite(match.similarity)) {
    throw new CompreFaceError(502, "Résultat de reconnaissance faciale invalide.");
  }
  return { subject: match.subject, similarity: match.similarity };
}

export async function registerSeniorFace(imageBuffer, seniorId, mimeType = "image/jpeg") {
  return callCompreFace(`faces?subject=${encodeURIComponent(seniorId)}`, { body: imageForm(imageBuffer, mimeType) });
}

export async function deleteSeniorFace(subject) {
  await callCompreFace(`faces?subject=${encodeURIComponent(subject)}`, { method: "DELETE" });
  return true;
}
