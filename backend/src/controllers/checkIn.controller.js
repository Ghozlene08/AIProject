import mongoose from "mongoose";
import CheckIn from "../models/CheckIn.js";
import Senior from "../models/Senior.js";
import { Alert } from "../models/index.js";

/* ---------- Helper: record + notify the caregivers ---------- */
async function notifyCheckInResponded(req, checkIn) {
  try {
    const senior = await Senior.findById(checkIn.senior);
    if (!senior) return;

    const seniorName = `${senior.firstName || ""} ${senior.lastName || ""}`.trim() || "Le senior";

    // Stored in the DB so the caregiver sees it in the alerts list
    const alert = await Alert.create({
      senior: senior._id,
      type: "info",
      severity: "info",
      title: "Check-in confirmé",
      message: `${seniorName} a confirmé qu'il/elle va bien.`,
      read: false,
    });

    // Live notification (only if the caregiver is connected)
    const io = req.app.get("io");
    if (io) {
      const event = {
        alertId: alert._id.toString(),
        checkInId: checkIn._id.toString(),
        seniorId: senior._id.toString(),
        seniorName,
        status: "responded",
        title: alert.title,
        message: alert.message,
        respondedAt: checkIn.respondedAt,
      };

      for (const caregiverId of senior.caregivers || []) {
        io.to(`user:${caregiverId.toString()}`).emit("checkin:responded", event);
      }
    }
  } catch (error) {
    // The senior's answer is already saved: a notification failure must not break it
    console.error("Check-in notification error:", error);
  }
}

/* ---------- Route de test ---------- */
export async function respondToCheckIn(req, res, next) {
  try {
    const { checkInId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(checkInId)) {
      return res.status(400).json({ message: "Identifiant du check-in invalide." });
    }

    const checkIn = await CheckIn.findOneAndUpdate(
      { _id: checkInId, status: "pending", deadlineAt: { $gt: new Date() } },
      { $set: { status: "responded", respondedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!checkIn) {
      return res.status(404).json({ message: "Check-in introuvable, déjà traité ou expiré." });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`senior:${checkIn.senior}`).emit("senior:check-in-dismissed", {
        checkInId: checkIn._id.toString(),
      });
    }

    await notifyCheckInResponded(req, checkIn);

    return res.status(200).json({ message: "Check-in confirmé.", checkIn });
  } catch (error) {
    next(error);
  }
}

/* ---------- Espace senior ---------- */

// GET /senior/check-in/pending?seniorId=...
export async function getPendingCheckIn(req, res, next) {
  try {
    const { seniorId } = req.query;

    if (!seniorId || !mongoose.Types.ObjectId.isValid(seniorId)) {
      return res.status(400).json({ message: "Identifiant du senior invalide." });
    }

    const now = new Date();
    const checkIn = await CheckIn.findOne({
      senior: seniorId,
      status: "pending",
      deadlineAt: { $gt: now },
    }).sort({ requestedAt: -1 });

    if (!checkIn) {
      return res.json({ checkIn: null });
    }

    return res.json({
      checkIn: {
        _id: checkIn._id.toString(),
        title: "Êtes-vous en sécurité ?",
        message: "Veuillez confirmer que vous allez bien.",
        requestedAt: checkIn.requestedAt,
        deadlineAt: checkIn.deadlineAt,
        remainingMs: checkIn.deadlineAt.getTime() - now.getTime(),
      },
    });
  } catch (error) {
    next(error);
  }
}

// POST /senior/check-in/:checkInId/respond   body: { seniorId }
export async function respondToCheckInAsSenior(req, res, next) {
  try {
    const { checkInId } = req.params;
    const { seniorId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(checkInId)) {
      return res.status(400).json({ message: "Identifiant du check-in invalide." });
    }
    if (!seniorId || !mongoose.Types.ObjectId.isValid(seniorId)) {
      return res.status(400).json({ message: "Identifiant du senior invalide." });
    }

    // The check-in must belong to this senior
    const checkIn = await CheckIn.findOneAndUpdate(
      {
        _id: checkInId,
        senior: seniorId,
        status: "pending",
        deadlineAt: { $gt: new Date() },
      },
      { $set: { status: "responded", respondedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!checkIn) {
      return res.status(404).json({ message: "Check-in introuvable, déjà traité ou expiré." });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`senior:${checkIn.senior}`).emit("senior:check-in-dismissed", {
        checkInId: checkIn._id.toString(),
      });
    }

    // Stored for the caregiver (alert + live event)
    await notifyCheckInResponded(req, checkIn);

    return res.json({ message: "Check-in confirmé.", checkIn });
  } catch (error) {
    next(error);
  }
}

/* ---------- Espace aidant ---------- */

// GET /aidant/seniors/:seniorId/check-ins?limit=20
// Check-in history of a senior (req.senior is set by loadSenior)
export async function listCheckIns(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const checkIns = await CheckIn.find({ senior: req.senior._id })
      .sort({ requestedAt: -1 })
      .limit(limit);

    const last = checkIns.find((c) => c.status === "responded") || null;

    res.json({
      checkIns,
      lastResponse: last ? last.respondedAt : null,
    });
  } catch (error) {
    next(error);
  }
}