import express, { Router } from "express";
import { requireSenior } from "../../middlewares/seniorAuth.js";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, baseMime } from "../../services/ai/stt.js";
import * as ctrl from "../../controllers/senior/senior.controller.js";
import { seniorMemoryRouter } from "../souvenirs/souvenirs.senior.routes.js";

/**
 * Routes de l'interface Senior, montées sous /api/senior.
 * Toutes (sauf la session de démo) exigent le jeton du senior : requireSenior, appliqué route par route.
 */
export const seniorRouter = Router();

// Session de démonstration : désactivée en production
if (process.env.NODE_ENV !== "production") {
  seniorRouter.post("/session-demo", ctrl.demoSession);
}

// ⚠️ Le jeton senior est vérifié route par route (et non avec seniorRouter.use) : ainsi les autres
// routes /api/senior/... de l'équipe (SOS, check-in…), déclarées après, ne sont pas bloquées.
seniorRouter.get("/moi", requireSenior, ctrl.me);

// Reconnaissance vocale : l'audio est envoyé « brut » (pas de JSON), lu par express.raw dans req.body
const rawAudio = express.raw({ type: (req) => AUDIO_TYPES.includes(baseMime(req.headers["content-type"])), limit: MAX_AUDIO_BYTES });
seniorRouter.post("/stt", requireSenior, rawAudio, ctrl.speechToText);

// Module F4 — Souvenirs (côté senior)
seniorRouter.use("/souvenirs", requireSenior, seniorMemoryRouter);
