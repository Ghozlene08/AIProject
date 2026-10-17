// Erreur HTTP « métier » : renvoyée telle quelle au client par le middleware d'erreurs
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Authentification requise") => new HttpError(401, msg);
export const forbidden = (msg = "Accès refusé") => new HttpError(403, msg);
export const notFound = (msg = "Ressource introuvable") => new HttpError(404, msg);

// Vérifie que les champs obligatoires sont présents dans le corps de la requête
export function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) throw badRequest(`Champs obligatoires manquants : ${missing.join(", ")}`);
}

// Ne garde que les clés autorisées (évite qu'un client modifie un champ protégé)
export function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
}
