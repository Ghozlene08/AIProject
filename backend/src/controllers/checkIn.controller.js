
import mongoose from "mongoose";
import CheckIn from "../models/CheckIn.js";

export async function respondToCheckIn(req, res, next) {
  try {
    const { checkInId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(checkInId)) {
      return res.status(400).json({
        message: "Identifiant du check-in invalide.",
      });
    }

    const checkIn = await CheckIn.findOneAndUpdate(
      {
        _id: checkInId,
        status: "pending",
        deadlineAt: { $gt: new Date() },
      },
      {
        $set: {
          status: "responded",
          respondedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!checkIn) {
      return res.status(404).json({
        message: "Check-in introuvable, déjà traité ou expiré.",
      });
    }

    const io = req.app.get("io");

    if (io) {
      io.to(`senior:${checkIn.senior}`).emit(
        "senior:check-in-dismissed",
        { checkInId: checkIn._id.toString() }
      );
    }

    return res.status(200).json({
      message: "Check-in confirmé.",
      checkIn,
    });
  } catch (error) {
    next(error);
  }
}
