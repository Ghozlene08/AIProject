import mongoose from "mongoose";

/**
 * Stockage des photos de souvenirs dans MongoDB, avec GridFS.
 * GridFS découpe chaque fichier en morceaux de 255 Ko (collections souvenirsPhotos.files
 * et souvenirsPhotos.chunks). Il est inclus dans le pilote MongoDB fourni avec mongoose :
 * aucun service externe, aucun paquet à installer, 0 €.
 */

const BUCKET = "souvenirsPhotos";
export const MAX_PHOTOS = 6; // par souvenir
export const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo par photo (le navigateur les réduit avant l'envoi)
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
const toId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Vérifie le contenu réel du fichier grâce à ses premiers octets (« signature »),
 * pour ne pas faire confiance au seul type annoncé par le navigateur.
 */
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Enregistre l'image et renvoie l'identifiant du fichier GridFS
export function savePhoto(buffer, { mime, memoryId }) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(`souvenir-${memoryId}`, { metadata: { memory: memoryId, mime } });
    upload.once("finish", () => resolve(upload.id));
    upload.once("error", reject);
    upload.end(buffer);
  });
}

// Envoie l'image au navigateur (lecture en flux, sans tout charger en mémoire)
export function streamPhoto(fileId, res, mime) {
  return new Promise((resolve, reject) => {
    const download = bucket().openDownloadStream(toId(fileId));
    download.once("error", reject);
    download.once("file", () => {
      res.set({ "Content-Type": mime, "Cache-Control": "private, max-age=86400" });
    });
    download.once("end", resolve);
    download.pipe(res);
  });
}

// Supprime une image (sans erreur si elle n'existe déjà plus)
export async function deletePhoto(fileId) {
  if (!fileId) return;
  await bucket()
    .delete(toId(fileId))
    .catch(() => {});
}

// Vide tout le stockage des photos (utilisé par le seed de démonstration)
export async function dropAllPhotos() {
  await bucket()
    .drop()
    .catch(() => {}); // le stockage n'existe pas encore : rien à faire
}
