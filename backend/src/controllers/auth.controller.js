import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User, Senior } from "../models/index.js";
import { signToken, signSeniorToken } from "../middlewares/auth.js";
import { trackEvent } from "../services/tracking.js";
import { badRequest, pick, requireFields, unauthorized } from "../utils/httpError.js";
import { recognizeSenior } from "../services/compreface.service.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Similarité minimale pour accepter un visage (entre 0 et 1)
const FACE_MIN_SIMILARITY = Number(process.env.FACE_MIN_SIMILARITY) || 0.9;

function checkPassword(pwd) {
  if (typeof pwd !== "string" || pwd.length < 8) {
    throw badRequest("Le mot de passe doit contenir au moins 8 caractères");
  }
}

// Inscription publique : uniquement des comptes aidants
export async function register(req, res) {
  requireFields(req.body, ["name", "email", "password"]);
  const { name, email, password, phone } = req.body;
  if (!EMAIL_RE.test(email)) throw badRequest("Adresse e-mail invalide");
  checkPassword(password);

  const user = await User.create({
    name,
    email,
    phone,
    role: "aidant",
    passwordHash: await bcrypt.hash(password, 10),
  });
  res.status(201).json({ token: signToken(user), user });
}

export async function login(req, res) {
  requireFields(req.body, ["email", "password"]);
  const user = await User.findOne({ email: String(req.body.email).toLowerCase() }).select("+passwordHash");
  const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) throw unauthorized("E-mail ou mot de passe incorrect");
  if (user.status !== "actif") throw unauthorized("Ce compte est désactivé");
  if (req.body.role && req.body.role !== user.role) {
    throw unauthorized(user.role === "admin" ? "Ce compte est un compte administrateur" : "Ce compte n'a pas accès à l'administration");
  }

  user.lastLoginAt = new Date();
  await user.save();
  if (user.role === "aidant") trackEvent({ user: user._id, actor: "aidant", module: "aidant", action: "connexion" });
  res.json({ token: signToken(user), user });
}

export async function me(req, res) {
  res.json({ user: req.user });
}

export async function updateMe(req, res) {
  const data = pick(req.body, ["name", "phone"]);
  if (req.body.notifications) {
    const n = pick(req.body.notifications, ["email", "telegram", "telegramChatId", "sms"]);
    for (const [k, v] of Object.entries(n)) req.user.notifications[k] = v;
  }
  Object.assign(req.user, data);
  await req.user.save();
  res.json({ user: req.user });
}

export async function changePassword(req, res) {
  requireFields(req.body, ["currentPassword", "newPassword"]);
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw badRequest("Mot de passe actuel incorrect");
  }
  checkPassword(req.body.newPassword);
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  res.json({ message: "Mot de passe modifié" });
}

// Connexion d'un senior par reconnaissance faciale
export async function seniorFaceLogin(req, res) {
  // La photo a été placée en mémoire par uploadFaceLogin
  if (!req.file || !req.file.buffer) {
    throw badRequest("Photo manquante");
  }

  let match;
  try {
    match = await recognizeSenior(req.file.buffer, req.file.mimetype);
  } catch (error) {
    console.error("Erreur service reconnaissance faciale :", error);
    throw new Error("Service de reconnaissance faciale indisponible");
  }

  console.log("Résultat reconnaissance :", match);

  if (!match) {
    throw unauthorized("Visage non reconnu");
  }

  if (match.similarity < FACE_MIN_SIMILARITY) {
    throw unauthorized("Visage non reconnu avec assez de certitude");

  }

  // Le sujet CompreFace doit être l'id MongoDB d'un senior
  if (!mongoose.Types.ObjectId.isValid(match.subject)) {
    console.error(
      "Sujet CompreFace invalide (ce n'est pas un id Mongo) :",
      match.subject
    );
    throw unauthorized("Ce visage n'est associé à aucun profil senior");
  }

  const senior = await Senior.findById(match.subject);

  if (!senior) {
    console.error("Aucun senior en base pour l'id :", match.subject);
    throw unauthorized("Profil senior introuvable");
  }

  const token = signSeniorToken(senior);

  res.json({
    token,
    senior,
    similarity: match.similarity,
  });
}