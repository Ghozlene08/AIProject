import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { badRequest } from "../utils/httpError.js";

/*
 * Upload de la photo de profil d'un senior (champ multipart "photo").
 * Fichier à placer dans : middleware/seniorPhoto.js
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 Mo
export const UPLOAD_ROOT = path.resolve("uploads");
const SENIOR_DIR = path.join(UPLOAD_ROOT, "seniors");
const PUBLIC_PREFIX = "/uploads/seniors/";

fs.mkdirSync(SENIOR_DIR, { recursive: true });

// L'extension vient du type MIME accepté, jamais du nom envoyé par le client
const MIME_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination: SENIOR_DIR,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    MIME_EXT[file.mimetype] ? cb(null, true) : cb(badRequest("Format d'image non pris en charge (JPG, PNG ou WebP).")),
});

// Le type MIME est déclaré par le client : on vérifie aussi la signature réelle du fichier
function hasImageSignature(filePath) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  return isJpeg || isPng || isWebp;
}

/** Middleware à placer APRÈS l'authentification : accepte au plus une image dans req.file */
export function uploadSeniorPhoto(req, res, next) {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return next(badRequest("L'image est trop lourde (2 Mo maximum)."));
      if (err instanceof multer.MulterError) return next(badRequest("Envoi de l'image impossible."));
      return next(err);
    }
    if (req.file && !hasImageSignature(req.file.path)) {
      removeUploadedFile(req.file);
      return next(badRequest("Le fichier envoyé n'est pas une image valide."));
    }
    next();
  });
}

/** Les champs multipart arrivent en texte : on remet doctor (JSON) et consentAI (booléen) en forme */
export function parseSeniorBody(body = {}) {
  const data = { ...body };
  if (typeof data.doctor === "string") {
    try {
      data.doctor = JSON.parse(data.doctor);
    } catch {
      throw badRequest("Informations du médecin invalides.");
    }
  }
  if (typeof data.consentAI === "string") data.consentAI = data.consentAI === "true";
  return data;
}

/** URL publique stockée en base pour le fichier tout juste envoyé */
export const photoUrlFor = (file) => (file ? `${PUBLIC_PREFIX}${file.filename}` : undefined);

/** Supprime un fichier tout juste uploadé (utile si la création/mise à jour échoue ensuite) */
export function removeUploadedFile(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

/** Supprime une ancienne photo à partir de son URL publique (ignore tout ce qui n'est pas à nous) */
export function removeStoredPhoto(photoUrl) {
  if (!photoUrl?.startsWith(PUBLIC_PREFIX)) return;
  fs.unlink(path.join(SENIOR_DIR, path.basename(photoUrl)), () => {});
}