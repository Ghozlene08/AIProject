const COMPREFACE_URL =
  process.env.COMPREFACE_URL || "http://localhost:8000";

const COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY;

/**
 * Envoie une photo à CompreFace pour identifier le senior.
 *
 * @param {Buffer} imageBuffer image capturée par la webcam
 * @param {string} mimeType ex: image/jpeg
 */
export async function recognizeSenior(imageBuffer, mimeType = "image/jpeg") {
  if (!COMPREFACE_API_KEY) {
    throw new Error("COMPREFACE_API_KEY n'est pas configurée");
  }

  const formData = new FormData();

  const blob = new Blob([imageBuffer], {
    type: mimeType,
  });

  formData.append("file", blob, "face.jpg");

  const response = await fetch(
    `${COMPREFACE_URL}/api/v1/recognition/recognize`,
    {
      method: "POST",
      headers: {
        "x-api-key": COMPREFACE_API_KEY,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const message = await response.text();

    console.error("Erreur CompreFace :", message);

    throw new Error("Impossible d'effectuer la reconnaissance faciale");
  }

  const data = await response.json();

  // Aucun visage détecté
  if (!data.result?.length) {
    return null;
  }

  const face = data.result[0];

  // Visage détecté mais aucun senior correspondant
  if (!face.subjects?.length) {
    return null;
  }

  const match = face.subjects[0];

  return {
    subject: match.subject,
    similarity: match.similarity,
  };
}