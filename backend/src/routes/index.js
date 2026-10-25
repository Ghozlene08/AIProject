import { Router } from "express";
import mongoose from "mongoose";
import { loadSenior, requireAuth, requireRole, requireSenior } from "../middlewares/auth.js";
import { uploadSeniorPhoto } from "../middlewares/seniorPhoto.js"; 
import { uploadFaceLogin } from "../middlewares/seniorFaceLogin.js";

import * as auth from "../controllers/auth.controller.js";
import * as aidant from "../controllers/aidant.controller.js";
import * as admin from "../controllers/admin.controller.js";
import * as sos from "../controllers/sos.controller.js";
import * as riskAnalyzer from "../controllers/riskAnalyzer.controller.js";
import { analyzeSeniorRisk } from "../services/riskAnalyzer.service.js";
import * as checkInController from "../controllers/checkIn.controller.js";
import * as stats from "../controllers/analytics.controller.js";
import * as senior from "../controllers/senior.controller.js";
import { optionalSenior, trackDocument, trackFaceLogin } from "../middlewares/usageTracking.js";
import { aidantMemoryRouter } from "./souvenirs/souvenirs.routes.js";
import { seniorRouter } from "./senior/senior.routes.js";

import { uploadDocument } from "../middlewares/documentUpload.js";
import * as document from "../controllers/document.controller.js";
import * as callCtrl from "../controllers/call.controller.js";
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
a.post("/seniors", uploadSeniorPhoto, aidant.createSenior);

// SOS d'un aidant (tous seniors confondus)
a.get("/sos", aidant.listMySos); // aidant déduit du token
a.get("/sos/active", aidant.listActiveSos); // non traités, format événement socket
a.get("/caregivers/:caregiverId/sos", aidant.listCaregiverSos); // historique par id d'aidant
a.get("/calls", callCtrl.listMyCalls); // all calls of the caregiver

const s = Router({ mergeParams: true });
s.use(loadSenior);
s.get("/", aidant.getSenior);
s.put("/", uploadSeniorPhoto, aidant.updateSenior);
s.get("/dashboard", aidant.dashboard);
s.get("/check-ins", checkInController.listCheckIns); // historique des check-ins d'un senior
s.get("/calls", callCtrl.listSeniorCalls); // call history of one senior
s.post("/sos", sos.triggerSOS);
s.get("/sos", aidant.listSos); // urgences d'un senior (SOS + check-in manqué)

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

// L'ordre compte : read-all AVANT :id
s.get("/alerts", aidant.listAlerts);
s.patch("/alerts/read-all", aidant.markAllAlerts);
s.patch("/alerts/:id", aidant.markAlert);
s.delete("/alerts", aidant.deleteAlerts); // nettoyage en masse (?type=sos)
s.delete("/alerts/:id", aidant.deleteAlert); // suppression d'une alerte

s.get("/summaries", aidant.listSummaries);
s.post("/summaries", aidant.createSummary);

// Module F4 — Souvenirs
s.use("/souvenirs", aidantMemoryRouter);

s.get("/risk-analysis", riskAnalyzer.analyzeRisk);

a.use("/seniors/:seniorId", s);
router.use("/aidant", a);

/* ---------- Espace Senior (F2 : agenda et rappels) ---------- */
// Connexion du senior : uniquement par reconnaissance faciale (POST /auth/senior/face-login).
// Comme dans senior.routes.js, la session est vérifiée ROUTE PAR ROUTE (pas de sn.use) :
// les autres routes /api/senior/... de l'équipe (SOS, check-in, souvenirs…) ne sont pas bloquées.
// La reconnaissance vocale utilise la route commune POST /api/senior/stt (senior.routes.js).
const sn = Router();
sn.get("/me", requireSenior, senior.me);
sn.get("/agenda", requireSenior, senior.agenda);
sn.get("/briefing", requireSenior, senior.briefing);
sn.get("/reminders/due", requireSenior, senior.dueReminders);
sn.post("/intakes/:id/confirm", requireSenior, senior.confirmIntake);
sn.post("/events", requireSenior, senior.createEvent);
sn.delete("/events/:id", requireSenior, senior.cancelEvent);
sn.post("/events/:id/ack", requireSenior, senior.ackEvent);
sn.post("/voice/agenda", requireSenior, senior.voiceAgenda);
sn.post("/voice/confirm", requireSenior, senior.voiceConfirm);
sn.post("/voice/tts", requireSenior, senior.tts);
router.use("/senior", sn);

// Mesure d'usage du module « Photo → Compris » (Arwa), sans toucher à ses routes ci-dessous :
// le senior est identifié si une session est présente, l'événement est enregistré d'après la réponse.
router.use("/documents", optionalSenior, trackDocument);

/* ---------- Interface Senior ---------- */
router.use("/senior", seniorRouter);

/* ---------- Documents senior ---------- */
router.post("/documents/ocr", uploadDocument, document.extractDocumentText);
router.post("/documents/explain", uploadDocument, document.explainDocument);

/* ---------- Espace Senior ---------- */
// Appel d'urgence : le senior est identifié par le seniorId envoyé dans le corps.
// Anti-spam : un seul SOS toutes les 30 secondes par senior.
const SOS_COOLDOWN_MS = 30_000;
const lastSosAt = new Map();

async function loadSeniorFromBody(req, res, next) {
  try {
    const seniorId = req.body?.seniorId;

    if (!seniorId || !mongoose.Types.ObjectId.isValid(seniorId)) {
      return res.status(400).json({ message: "Identifiant du senior invalide." });
    }

    const key = String(seniorId);
    const last = lastSosAt.get(key) || 0;
    if (Date.now() - last < SOS_COOLDOWN_MS) {
      return res
        .status(429)
        .json({ message: "Une alerte vient déjà d'être envoyée. Patientez quelques secondes." });
    }

    const senior = await mongoose.model("Senior").findById(seniorId);
    if (!senior) {
      return res.status(404).json({ message: "Senior introuvable." });
    }

    req.senior = senior;

    // Le délai n'est enregistré qu'une fois l'alerte réellement envoyée
    res.on("finish", () => {
      if (res.statusCode < 400) lastSosAt.set(key, Date.now());
    });

    next();
  } catch (error) {
    next(error);
  }
}

router.post("/senior/sos", loadSeniorFromBody, sos.triggerSOS);

// Check-in : le senior consulte et confirme (identifié par seniorId)
router.get("/senior/check-in/pending", checkInController.getPendingCheckIn);
router.post("/senior/check-in/:checkInId/respond", checkInController.respondToCheckInAsSenior);
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

/* ---------- TEMPORARY: development testing only ---------- */
if (process.env.NODE_ENV !== "production") {
  // Simulate a senior answering a check-in
  router.post("/test/check-ins/:checkInId/respond", checkInController.respondToCheckIn);

  // Trigger an SOS for a senior
  router.post("/test/seniors/:seniorId/sos", async (req, res, next) => {
    try {
      req.senior = await mongoose.model("Senior").findById(req.params.seniorId);

      if (!req.senior) {
        return res.status(404).json({ message: "Senior introuvable." });
      }

      return sos.triggerSOS(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  // Run the risk analysis for a senior
  router.get("/test/seniors/:seniorId/risk-analysis", async (req, res, next) => {
    try {
      const { seniorId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(seniorId)) {
        return res.status(400).json({ message: "Identifiant du senior invalide." });
      }

      const senior = await mongoose.model("Senior").findById(seniorId);

      if (!senior) {
        return res.status(404).json({ message: "Senior introuvable." });
      }

      const result = await analyzeSeniorRisk(senior._id);

      return res.status(200).json({
        seniorId: senior._id,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });
}

export default router;
