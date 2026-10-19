import express, { Router } from "express";
import { ALLOWED_TYPES, MAX_BYTES } from "../../services/souvenirs/photo.storage.js";
import * as ctrl from "../../controllers/souvenirs/souvenirs.controller.js";

/**
 * Routes Aidant du module Souvenirs, montées sous /api/aidant/seniors/:seniorId/souvenirs
 * (requireAuth, requireRole et loadSenior sont déjà appliqués par le routeur parent).
 */
export const aidantMemoryRouter = Router({ mergeParams: true });

aidantMemoryRouter.get("/", ctrl.list);
aidantMemoryRouter.get("/stats", ctrl.stats); // avant "/:id"
aidantMemoryRouter.post("/", ctrl.create);
aidantMemoryRouter.get("/:id", ctrl.getOne);
aidantMemoryRouter.put("/:id", ctrl.update);
aidantMemoryRouter.patch("/:id/valider", ctrl.validate);
aidantMemoryRouter.patch("/:id/visibilite", ctrl.setVisibility); // masquer / démasquer pour le senior
aidantMemoryRouter.post("/:id/regenerer", ctrl.regenerate); // propose un autre récit (rien n'est enregistré)
aidantMemoryRouter.put("/:id/recit", ctrl.acceptProposal); // l'aidant accepte la proposition → enregistrée
aidantMemoryRouter.delete("/:id", ctrl.remove);

// Photos : l'image est envoyée « brute » (pas de JSON) ; express.raw la lit dans req.body (limite 5 Mo)
const rawImage = express.raw({ type: ALLOWED_TYPES, limit: MAX_BYTES });
aidantMemoryRouter.post("/:id/photos", rawImage, ctrl.addPhoto);
aidantMemoryRouter.get("/:id/photos/:photoId", ctrl.getPhoto);
aidantMemoryRouter.delete("/:id/photos/:photoId", ctrl.removePhoto);
