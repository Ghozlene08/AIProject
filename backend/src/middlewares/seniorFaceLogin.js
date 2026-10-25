import multer from "multer";
import { badRequest } from "../utils/httpError.js";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 Mo

const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: 1,
  },

  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        badRequest("Format d'image non pris en charge (JPG, PNG ou WebP).")
      );
    }

    cb(null, true);
  },
});

export function uploadFaceLogin(req, res, next) {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          badRequest("L'image est trop lourde (2 Mo maximum).")
        );
      }

      if (err instanceof multer.MulterError) {
        return next(
          badRequest("Envoi de l'image impossible.")
        );
      }

      return next(err);
    }

    if (!req.file) {
      return next(
        badRequest("Aucune photo reçue.")
      );
    }

    next();
  });
}