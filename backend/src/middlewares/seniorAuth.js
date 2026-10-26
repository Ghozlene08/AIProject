import jwt from "jsonwebtoken";
import { Senior } from "../models/index.js";
import { unauthorized } from "../utils/httpError.js";
import { jwtSecret } from "./auth.js";

/**
 * Authentification de l'interface Senior.
 * Le senior n'a pas de compte « utilisateur » (pas d'e-mail ni de mot de passe) : il reçoit
 * un jeton JWT qui contient l'identifiant de son profil (rôle "senior").
 *
 * Ce jeton est créé par la connexion du senior (code d'appairage + PIN, ou reconnaissance
 * faciale), réalisée par l'équipe. En attendant, une session de démonstration le fournit
 * (voir controllers/senior/senior.controller.js → demoSession).
 */

export const signSeniorToken = (senior) =>
  jwt.sign({ sub: senior._id.toString(), role: "senior" }, jwtSecret(), { expiresIn: "30d" });

// Vérifie le jeton « Authorization: Bearer … » et charge le profil du senior dans req.senior
export async function requireSenior(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized("Session senior requise");

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw unauthorized("Session expirée, veuillez vous reconnecter");
  }
  if (payload.role !== "senior") throw unauthorized("Ce jeton n'est pas celui d'un senior");

  const senior = await Senior.findById(payload.sub);
  if (!senior) throw unauthorized("Profil senior introuvable");
  req.senior = senior;
  next();
}
