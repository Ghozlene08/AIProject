import jwt from "jsonwebtoken";
import { Senior } from "../models/index.js";
import { jwtSecret } from "./auth.js";
import { trackEvent } from "../services/tracking.js";

/*
 * Mesure d'usage des modules sans modifier leurs contrôleurs :
 *  - optionalSenior : reconnaît le senior si une session est présente (ne bloque jamais) ;
 *  - trackResponse  : enregistre un événement d'usage d'après la réponse envoyée.
 */

export async function optionalSenior(req, _res, next) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), jwtSecret());
      if (payload.role === "senior") req.senior = await Senior.findById(payload.sub);
    } catch {
      /* session absente ou expirée : la requête continue sans identification */
    }
  }
  next();
}

/**
 * build(req, statusCode, body, latencyMs) → événement à enregistrer, ou null.
 * L'événement est écrit après l'envoi de la réponse : aucun impact sur le temps de réponse.
 */
export const trackResponse = (build) => (req, res, next) => {
  const started = Date.now();
  const json = res.json.bind(res);
  res.json = (body) => {
    res.once("finish", () => {
      try {
        const event = build(req, res.statusCode, body, Date.now() - started);
        if (event?.senior) trackEvent(event);
      } catch {
        /* la mesure ne doit jamais gêner le module */
      }
    });
    return json(body);
  };
  next();
};

/* ---------- Règles de mesure par module ---------- */

// F3 « Photo → Compris » : document lu et expliqué, ou illisible
export const trackDocument = trackResponse((req, status, _body, latencyMs) => ({
  senior: req.senior?._id,
  actor: "senior",
  module: "documents",
  action: "document_traite",
  channel: "ecran",
  outcome: status < 400 ? "reussi" : "echec",
  failureReason: status === 422 ? "document_illisible" : status >= 400 ? "erreur_serveur" : undefined,
  latencyMs,
}));

// Connexion par reconnaissance faciale réussie (+ présence visible par l'aidant)
export const trackFaceLogin = trackResponse((_req, status, body) => {
  if (status >= 400 || !body?.senior?._id) return null;
  Senior.updateOne({ _id: body.senior._id }, { lastSeenAt: new Date() }).catch(() => {});
  return { senior: body.senior._id, actor: "senior", module: "assistant", action: "connexion", channel: "ecran", outcome: "reussi" };
});
