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
  
console.log("Réponse CompreFace :", JSON.stringify(data));
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
/**
 * Enregistre le visage d'un senior dans CompreFace.
 *
 * @param {Buffer} imageBuffer photo du senior
 * @param {string} seniorId id MongoDB du senior
 * @param {string} mimeType type de l'image
 */
export async function registerSeniorFace(
  imageBuffer,
  seniorId,
  mimeType = "image/jpeg"
) {
  if (!COMPREFACE_API_KEY) {
    throw new Error("COMPREFACE_API_KEY n'est pas configurée");
  }

  const formData = new FormData();

  const blob = new Blob([imageBuffer], {
    type: mimeType,
  });

  formData.append("file", blob, "face.jpg");

  const response = await fetch(
    `${COMPREFACE_URL}/api/v1/recognition/faces?subject=${encodeURIComponent(
      seniorId
    )}`,
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

    console.error("Erreur enregistrement CompreFace :", message);

    throw new Error(
      "Impossible d'enregistrer le visage du senior dans CompreFace"
    );
  }

  const data = await response.json();

  console.log(
    "Visage enregistré dans CompreFace pour le senior :",
    seniorId
  );

  return data;
}
export async function deleteSeniorFace(subject) {
  if (!COMPREFACE_API_KEY) {
    throw new Error("COMPREFACE_API_KEY n'est pas configurée");
  }

  const response = await fetch(
    `${COMPREFACE_URL}/api/v1/recognition/faces?subject=${encodeURIComponent(
      subject
    )}`,
    {
      method: "DELETE",
      headers: {
        "x-api-key": COMPREFACE_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const message = await response.text();

    console.error("Erreur suppression CompreFace :", message);

    throw new Error(
      "Impossible de supprimer l'ancien visage dans CompreFace"
    );
  }

  console.log(
    "Ancien visage supprimé de CompreFace :",
    subject
  );

  return true;
}