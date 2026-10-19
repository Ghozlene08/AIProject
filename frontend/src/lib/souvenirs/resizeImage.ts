/**
 * Réduit une photo dans le navigateur avant de l'envoyer au serveur.
 * Une photo de téléphone pèse souvent 3 à 8 Mo ; réduite à 1600 px de large en JPEG,
 * elle passe sous les 500 Ko. L'envoi est plus rapide et le stockage plus léger,
 * sans perte visible sur l'écran du senior. Aucune bibliothèque : on dessine
 * simplement l'image dans un <canvas> plus petit.
 */
const MAX_SIDE = 1600; // plus grand côté, en pixels
const QUALITY = 0.85; // qualité JPEG (0 à 1)

export async function resizeImage(file: File): Promise<Blob> {
  // createImageBitmap applique aussi l'orientation de la photo (téléphone tenu à la verticale)
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Votre navigateur ne permet pas de préparer la photo");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("La photo n'a pas pu être préparée"))), "image/jpeg", QUALITY),
  );
}
