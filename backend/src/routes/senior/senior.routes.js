import express, { Router } from "express";
import { requireSenior } from "../../middlewares/seniorAuth.js";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, baseMime } from "../../services/ai/stt.js";
import * as ctrl from "../../controllers/senior/senior.controller.js";
import { seniorMemoryRouter } from "../souvenirs/souvenirs.senior.routes.js";

/**
 * Routes de l'interface Senior, montées sous /api/senior.
 * Toutes (sauf la session de démo) exigent le jeton du senior : requireSenior.
 */
export const seniorRouter = Router();

// Session de démonstration : désactivée en production
if (process.env.NODE_ENV !== "production") {
  seniorRouter.post("/session-demo", ctrl.demoSession);
}

seniorRouter.use(requireSenior);
seniorRouter.get("/moi", ctrl.me);

// Reconnaissance vocale : l'audio est envoyé « brut » (pas de JSON), lu par express.raw dans req.body
const rawAudio = express.raw({ type: (req) => AUDIO_TYPES.includes(baseMime(req.headers["content-type"])), limit: MAX_AUDIO_BYTES });
seniorRouter.post("/stt", rawAudio, ctrl.speechToText);

// Module F4 — Souvenirs (côté senior)
seniorRouter.use("/souvenirs", seniorMemoryRouter);
