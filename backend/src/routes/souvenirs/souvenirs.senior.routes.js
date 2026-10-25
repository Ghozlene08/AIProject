import { Router } from "express";
import * as ctrl from "../../controllers/souvenirs/souvenirs.senior.controller.js";

/**
 * Routes SENIOR du module Souvenirs, montées sous /api/senior/souvenirs
 * (le jeton du senior est déjà vérifié par le routeur parent : requireSenior).
 */
export const seniorMemoryRouter = Router();

seniorMemoryRouter.get("/", ctrl.list);
seniorMemoryRouter.post("/choisir", ctrl.choose); // avant "/:id"
// Quiz : réponses jugées par le serveur (les bonnes réponses ne sont jamais envoyées à l'avance)
seniorMemoryRouter.post("/quiz/:sessionId/reponse", ctrl.answerQuiz);
seniorMemoryRouter.post("/quiz/:sessionId/fin", ctrl.finishQuiz);
seniorMemoryRouter.get("/:id", ctrl.getOne);
seniorMemoryRouter.get("/:id/photos/:photoId", ctrl.getPhoto); // photos montrées pendant le récit
seniorMemoryRouter.post("/:id/ecoute", ctrl.markListened);
seniorMemoryRouter.post("/:id/quiz", ctrl.startQuiz); // commence une partie // récit écouté jusqu'au bout → statistiques
