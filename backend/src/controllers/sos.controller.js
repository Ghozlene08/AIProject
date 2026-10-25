import { Alert, User } from "../models/index.js";

export async function triggerSOS(req, res, next) {
  try {
    const senior = req.senior;

    if (!senior) {
      return res.status(404).json({
        message: "Senior introuvable.",
      });
    }

    // 1. Save the emergency first.
    const alert = await Alert.create({
      senior: senior._id,
      type: "sos",
      severity: "haute",
      title: "Urgence SOS",
      message: "Le senior a déclenché une alerte SOS.",
      read: false,
    });

    // 2. Find the assigned caregivers.
    const caregivers = await User.find({
      _id: { $in: senior.caregivers || [] },
    }).select("_id firstName lastName");

    // 3. Get the Socket.IO server.
    const io = req.app.get("io");

    if (!io) {
      return res.status(201).json({
        message: "SOS enregistré, mais Socket.IO n'est pas disponible.",
        alert,
        notificationsSent: 0,
      });
    }

    // 4. Prepare the emergency event.
    const sosEvent = {
      alertId: alert._id.toString(),
      seniorId: senior._id.toString(),
      seniorName:
        `${senior.firstName || ""} ${senior.lastName || ""}`.trim(),
      type: "sos",
      severity: "haute",
      title: "Urgence SOS",
      message: "Un senior a déclenché une alerte SOS.",
      createdAt: alert.createdAt,
    };

    // 5. Send the event to each caregiver's private room.
    let notificationsSent = 0;

    for (const caregiver of caregivers) {
      const room = `user:${caregiver._id.toString()}`;

      // Only count users who currently have a connected socket.
      const isOnline = io.sockets.adapter.rooms.has(room);

      if (isOnline) {
        io.to(room).emit("sos:alert", sosEvent);
        notificationsSent++;
      }
    }

    return res.status(201).json({
      message: "Alerte SOS enregistrée.",
      alert,
      caregiversFound: caregivers.length,
      caregiversOnline: notificationsSent,
      notificationsSent,
    });
  } catch (error) {
    next(error);
  }
}