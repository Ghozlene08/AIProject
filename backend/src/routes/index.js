import express, { Router } from "express";
import mongoose from "mongoose";
import { loadSenior, requireAuth, requireRole, requireSenior } from "../middlewares/auth.js";
import { uploadSeniorPhoto } from "../middlewares/seniorPhoto.js"; 
import { uploadFaceLogin } from "../middlewares/seniorFaceLogin.js";
import * as auth from "../controllers/auth.controller.js";
import * as aidant from "../controllers/aidant.controller.js";
import * as admin from "../controllers/admin.controller.js";
import * as stats from "../controllers/analytics.controller.js";
import * as senior from "../controllers/senior.controller.js";
import { uploadDocument } from "../middlewares/documentUpload.js";
import * as document from "../controllers/document.controller.js";
import { optionalSenior, trackDocument, trackFaceLogin } from "../middlewares/usageTracking.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connectée" : "déconnectée" });
});

/* ---------- Authentification ---------- */
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.post("/auth/senior/face-login", trackFaceLogin, uploadFaceLogin, auth.seniorFaceLogin);
router.get("/auth/me", requireAuth, auth.me);
router.put("/auth/me", requireAuth, auth.updateMe);
router.put("/auth/password", requireAuth, auth.changePassword);

/* ---------- Espace Aidant ---------- */
const a = Router();
a.use(requireAuth, requireRole("aidant", "admin"));
a.get("/seniors", aidant.listSeniors);
a.post("/seniors", uploadSeniorPhoto, aidant.createSenior); // ← CHANGED : lit le multipart + la photo

const s = Router({ mergeParams: true });
s.use(loadSenior);
s.get("/", aidant.getSenior);
s.put("/", uploadSeniorPhoto, aidant.updateSenior); // ← CHANGED : lit le multipart + la photo
s.get("/dashboard", aidant.dashboard);

s.post("/contacts", aidant.createContact);
s.put("/contacts/:id", aidant.updateContact);
s.delete("/contacts/:id", aidant.deleteContact);

s.get("/medications", aidant.listMedications);
s.post("/medications", aidant.createMedication);
s.put("/medications/:id", aidant.updateMedication);
s.delete("/medications/:id", aidant.deleteMedication);

s.get("/intakes", aidant.listIntakes);
s.patch("/intakes/:id", aidant.updateIntake);
s.get("/adherence", aidant.adherence);

s.get("/events", aidant.listEvents);
s.post("/events", aidant.createEvent);
s.put("/events/:id", aidant.updateEvent);
s.delete("/events/:id", aidant.deleteEvent);

s.get("/alerts", aidant.listAlerts);
s.patch("/alerts/read-all", aidant.markAllAlerts);
s.patch("/alerts/:id", aidant.markAlert);

s.get("/summaries", aidant.listSummaries);
s.post("/summaries", aidant.createSummary);

a.use("/seniors/:seniorId", s);
router.use("/aidant", a);

/* ---------- Espace Senior (F2 : agenda et rappels) ---------- */
// Connexion du senior : uniquement par reconnaissance faciale (POST /auth/senior/face-login)
const sn = Router();
sn.use(requireSenior);
sn.get("/me", senior.me);
sn.get("/agenda", senior.agenda);
sn.get("/briefing", senior.briefing);
sn.get("/reminders/due", senior.dueReminders);
sn.post("/intakes/:id/confirm", senior.confirmIntake);
sn.post("/events", senior.createEvent);
sn.delete("/events/:id", senior.cancelEvent);
sn.post("/events/:id/ack", senior.ackEvent);
sn.post("/voice/transcribe", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" }), senior.transcribe);
sn.post("/voice/agenda", senior.voiceAgenda);
sn.post("/voice/confirm", senior.voiceConfirm);
sn.post("/voice/tts", senior.tts);
router.use("/senior", sn);

/* ---------- Espace Senior : F3 « Photo → Compris » (module d'Arwa) ---------- */
// Routes perdues lors de la résolution du conflit de fusion (e5dfb9e), rétablies à l'identique
// avec en plus la mesure d'usage (le senior est identifié si une session est présente).
router.post("/documents/ocr", optionalSenior, trackDocument, uploadDocument, document.extractDocumentText);
router.post("/documents/explain", optionalSenior, trackDocument, uploadDocument, document.explainDocument);

/* ---------- Administration ---------- */
const ad = Router();
ad.use(requireAuth, requireRole("admin"));
ad.get("/overview", stats.overview);
ad.get("/analytics", stats.trends);
ad.get("/users-stats", stats.users);
ad.get("/ai-services", stats.aiServices);
ad.get("/insights", stats.insightsList);
ad.get("/report", stats.report);
ad.get("/export", stats.exportCsv);
ad.get("/settings", stats.getSettings);
ad.put("/settings", stats.updateSettings);
ad.get("/ai-calls", admin.listAiCalls);
ad.get("/providers", admin.listProviders);
ad.put("/providers/:id", admin.updateProvider);
ad.post("/ai/test", admin.testGateway);
ad.get("/users", admin.listUsers);
ad.post("/users", admin.createUser);
ad.put("/users/:id", admin.updateUser);
ad.delete("/users/:id", admin.deleteUser);
router.use("/admin", ad);

export default router;