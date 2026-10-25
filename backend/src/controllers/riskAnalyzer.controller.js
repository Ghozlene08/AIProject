
import mongoose from "mongoose";
import { analyzeSeniorRisk } from "../services/riskAnalyzer.service.js";

export async function analyzeRisk(req, res, next) {
  try {
    const { seniorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(seniorId)) {
      return res.status(400).json({
        message: "Identifiant du senior invalide.",
      });
    }

    // req.senior est chargé et vérifié par le middleware loadSenior.
    const result = await analyzeSeniorRisk(req.senior._id);

    return res.status(200).json({
      seniorId: req.senior._id,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
