import multer from "multer";
import { badRequest } from "../utils/httpError.js";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 Mo

const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
   "application/pdf",
];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_DOCUMENT_BYTES,
    files: 1,
  },

  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
badRequest("Format de document non pris en charge (PDF, JPG, PNG ou WebP)."
)      );
    }

    cb(null, true);
  },
});

export function uploadDocument(req, res, next) {
  upload.single("document")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          badRequest("Le document est trop lourd (5 Mo maximum).")
        );
      }

      if (err instanceof multer.MulterError) {
        return next(
          badRequest("Envoi du document impossible.")
        );
      }

      return next(err);
    }

    if (!req.file) {
      return next(
        badRequest("Aucun document reçu.")
      );
    }

    next();
  });
}