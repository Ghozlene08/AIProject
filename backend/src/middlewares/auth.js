import jwt from "jsonwebtoken";
import { User, Senior } from "../models/index.js";
import { forbidden, notFound, unauthorized } from "../utils/httpError.js";

export const jwtSecret = () => process.env.JWT_SECRET || "dev-secret-a-changer";

export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
// =========================
// TOKEN SENIOR
// =========================
export const signSeniorToken = (senior) =>
  jwt.sign(
    {
      sub: senior._id.toString(),
      role: "senior",
    },
    jwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
// Vérifie le jeton « Authorization: Bearer … » et charge l'utilisateur
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw unauthorized("Session expirée, veuillez vous reconnecter");
  }

  const user = await User.findById(payload.sub);
  if (!user || user.status !== "actif") throw unauthorized("Compte introuvable ou désactivé");
  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) throw forbidden();
  next();
};
// =========================
// AUTH SENIOR
// =========================

export async function requireSeniorAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) throw unauthorized();

  let payload;

  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw unauthorized("Session expirée, veuillez vous reconnecter");
  }

  if (payload.role !== "senior") {
    throw unauthorized("Accès réservé aux seniors");
  }

  const senior = await Senior.findById(payload.sub);

  if (!senior) {
    throw unauthorized("Profil senior introuvable");
  }

  req.senior = senior;
  next();
}
// Charge le senior :seniorId et vérifie que l'aidant connecté y a accès
export async function loadSenior(req, _res, next) {
  const senior = await Senior.findById(req.params.seniorId).catch(() => null);
  if (!senior) throw notFound("Profil senior introuvable");
  const allowed =
    req.user.role === "admin" || senior.caregivers.some((id) => id.equals(req.user._id));
  if (!allowed) throw forbidden("Ce profil n'est pas rattaché à votre compte");
  req.senior = senior;
  next();
}

/* ---------- Session du senior (connexion par visage ou par code + PIN) ---------- */
// Le jeton est créé par signSeniorToken (en haut du fichier), commun aux deux modes de connexion.

// Vérifie un jeton de senior et charge son profil
export async function requireSenior(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw unauthorized("Session expirée, veuillez vous reconnecter");
  }
  if (payload.role !== "senior") throw forbidden("Espace réservé au senior");
  const senior = await Senior.findById(payload.sub);
  if (!senior) throw unauthorized("Profil introuvable");
  // Présence « en ligne » visible par l'aidant (au plus une écriture par minute)
  if (!senior.lastSeenAt || Date.now() - senior.lastSeenAt.getTime() > 60000) {
    senior.lastSeenAt = new Date();
    await senior.save();
  }
  req.senior = senior;
  next();
}
