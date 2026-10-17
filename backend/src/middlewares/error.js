import mongoose from "mongoose";

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route introuvable : ${req.method} ${req.originalUrl}` });
}

// Middleware d'erreurs : transforme chaque erreur en réponse JSON lisible
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: details.join(" · "), details });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: "Identifiant invalide" });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ message: "Cette valeur existe déjà (doublon)" });
  }
  const status = err.status || 500;
  if (status >= 500) console.error("❌", err);
  res.status(status).json({
    message: status >= 500 ? "Erreur interne du serveur" : err.message,
    details: err.details,
  });
}
