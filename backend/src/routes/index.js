import { Router } from "express";
import mongoose from "mongoose";
import { loadSenior, requireAuth, requireRole } from "../middlewares/auth.js";
import { uploadSeniorPhoto } from "../middlewares/seniorPhoto.js"; 
import { uploadFaceLogin } from "../middlewares/seniorFaceLogin.js";
import * as auth from "../controllers/auth.controller.js";
import * as aidant from "../controllers/aidant.controller.js";
import * as admin from "../controllers/admin.controller.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connectée" : "déconnectée" });
});

/* ---------- Authentification ---------- */
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.post("/auth/senior/face-login",uploadFaceLogin,auth.seniorFaceLogin);
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
s.post("/pairing", aidant.regeneratePairing);
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

/* ---------- Administration ---------- */
const ad = Router();
ad.use(requireAuth, requireRole("admin"));
ad.get("/overview", admin.overview);
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