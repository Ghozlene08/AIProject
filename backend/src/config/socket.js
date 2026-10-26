import { Server } from "socket.io";
import { jwtSecret } from "../middlewares/auth.js";
import jwt from "jsonwebtoken";
import Senior from "../models/Senior.js";
import Call from "../models/Call.js";
import { Alert } from "../models/index.js";

const RING_TIMEOUT_MS = Number(process.env.CALL_RING_SECONDS || 45) * 1000;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const IS_PROD = process.env.NODE_ENV === "production";

// callId -> call state in memory (live signaling). The database keeps the history.
const calls = new Map();

const MISSED_CALL_MESSAGES = {
  offline: (name) => `${name} a essayé de vous appeler alors que vous n'étiez pas connecté.`,
  timeout: (name) => `${name} a essayé de vous appeler, mais personne n'a répondu.`,
  rejected: (name) => `${name} a essayé de vous appeler, mais l'appel a été refusé.`,
  cancelled: (name) => `${name} a essayé de vous appeler puis a raccroché avant votre réponse.`,
};

export function configureSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // Calls interrupted by a server restart can never finish
  Call.updateMany(
    { status: { $in: ["ringing", "in_progress"] } },
    { $set: { status: "failed", endedAt: new Date(), endedBy: "system", endReason: "server_restart" } },
  ).catch((err) => console.error("Call cleanup error:", err.message));

  /* ---------- Authentication ---------- */
  io.use(async (socket, next) => {
    const { token, seniorId, userId } = socket.handshake.auth || {};

    if (token) {
      try {
     const payload = jwt.verify(token, jwtSecret());
        socket.data.userId = String(payload.sub || payload.id || payload._id);
        return next();
      } catch {
        return next(new Error("Token invalide."));
      }
    }

    // DEV ONLY: caregiver identified by the stored userId
    if (!IS_PROD && typeof userId === "string" && OBJECT_ID.test(userId)) {
      socket.data.userId = userId;
      return next();
    }

    if (typeof seniorId === "string" && OBJECT_ID.test(seniorId)) {
      try {
        const exists = await Senior.exists({ _id: seniorId });
        if (!exists) return next(new Error("Senior introuvable."));
        socket.data.seniorId = seniorId;
        return next();
      } catch {
        return next(new Error("Authentification impossible."));
      }
    }

    if (!IS_PROD) return next();
    return next(new Error("Authentification requise."));
  });

  /* ---------- Call helpers ---------- */

  // Saves a change in the DB, always after the creation of the document
  function persist(call, patch) {
    call.dbReady = call.dbReady
      .then(() => Call.updateOne({ callId: call.callId }, { $set: patch }))
      .catch((err) => console.error("Call save error:", err.message));
  }

  // Removes the call from memory AND writes its final state in the DB
  function finalize(callId, status, endedBy, endReason) {
    const call = calls.get(callId);
    if (!call) return null;

    clearTimeout(call.timer);
    calls.delete(callId);

    const endedAt = new Date();
    const durationSeconds = call.connectedAt
      ? Math.max(0, Math.round((endedAt - call.connectedAt) / 1000))
      : 0;

    persist(call, { status, endedAt, endedBy, endReason, durationSeconds });
    return { call, durationSeconds };
  }

  // A call nobody picked up becomes an alert in the caregiver's "Alertes" page.
  // The alert belongs to the senior, so EVERY linked caregiver sees it,
  // even those who were offline when the call happened.
  async function createMissedCallAlert({ seniorId, seniorName, reason, callId, linkedIds = [] }) {
    try {
      const buildMessage = MISSED_CALL_MESSAGES[reason] || MISSED_CALL_MESSAGES.timeout;

      const alert = await Alert.create({
        senior: seniorId,
        type: "appel_manque",
        severity: "haute",
        title: "Appel manqué",
        message: buildMessage(seniorName),
        callId,
      });

      // Tells every open caregiver page to refresh (no emergency popup)
      for (const id of linkedIds) {
        io.to(`user:${id}`).emit("alert:new", {
          alertId: String(alert._id),
          type: "appel_manque",
          seniorId: String(seniorId),
        });
      }
    } catch (err) {
      console.error("Missed call alert error:", err.message);
    }
  }

  // Ends a call and tells the other side
  function endCall(socket, callId, reason = "hangup") {
    const call = calls.get(callId);
    if (!call) return;

    const isSenior = call.seniorSocketId === socket.id;
    const isCaregiver = call.acceptedSocketId === socket.id;
    if (!isSenior && !isCaregiver) return;

    const endedBy = isSenior ? "senior" : "caregiver";

    if (call.acceptedSocketId) {
      const status = call.connectedAt ? "completed" : "failed";
      const result = finalize(callId, status, endedBy, reason);
      io.to(isSenior ? call.acceptedSocketId : call.seniorSocketId).emit("call:ended", {
        callId,
        durationSeconds: result?.durationSeconds ?? 0,
      });
    } else if (isSenior) {
      // Senior hung up (or lost connection) while it was still ringing
      finalize(callId, "cancelled", "senior", reason);
      for (const id of call.caregiverIds) io.to(`user:${id}`).emit("call:cancelled", { callId });

      // The caregiver never had time to answer: that is a missed call
      createMissedCallAlert({
        seniorId: call.seniorId,
        seniorName: call.seniorName,
        reason: "cancelled",
        callId,
        linkedIds: call.linkedIds,
      });
    }
  }

  io.on("connection", (socket) => {
    console.log("✅ Socket connected:", socket.id, {
      userId: socket.data.userId || null,
      seniorId: socket.data.seniorId || null,
    });

    if (socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
      console.log(`👤 User ${socket.data.userId} joined room user:${socket.data.userId}`);
    }

    if (socket.data.seniorId) {
      socket.join(`senior:${socket.data.seniorId}`);
      console.log(`🧓 Senior ${socket.data.seniorId} connected`);
    }

    /* ---------- Temporary local testing only ---------- */
    socket.on("test:join-caregiver", (caregiverId) => {
      if (!IS_PROD && typeof caregiverId === "string" && OBJECT_ID.test(caregiverId)) {
        socket.data.userId = socket.data.userId || caregiverId;
        socket.join(`user:${caregiverId}`);
        console.log(`👤 Test caregiver joined: ${caregiverId}`);
        socket.emit("test:joined", { message: "Caregiver joined successfully." });
      }
    });

    socket.on("test:join-user", (userId) => {
      if (!IS_PROD && typeof userId === "string" && OBJECT_ID.test(userId)) {
        socket.data.userId = socket.data.userId || userId;
        socket.join(`user:${userId}`);
        console.log(`🧪 Test user joined room: ${userId}`);
        socket.emit("test:user-joined", { userId });
      }
    });

    /* ---------- 1. Senior starts a call ---------- */
    socket.on("call:start", async ({ callId } = {}) => {
      try {
        const seniorId = socket.data.seniorId;

        if (!seniorId) {
          return socket.emit("call:error", { callId, message: "Seul un senior peut lancer cet appel." });
        }
        if (typeof callId !== "string" || callId.length === 0 || callId.length > 64 || calls.has(callId)) {
          return socket.emit("call:error", { callId, message: "Appel invalide." });
        }
        for (const c of calls.values()) {
          if (c.seniorId === seniorId) {
            return socket.emit("call:error", { callId, message: "Un appel est déjà en cours." });
          }
        }

        const senior = await Senior.findById(seniorId).select("firstName lastName caregivers");
        if (!senior) return socket.emit("call:error", { callId, message: "Senior introuvable." });

        const seniorName = `${senior.firstName || ""} ${senior.lastName || ""}`.trim() || "Votre proche";
        const linked = (senior.caregivers || []).map(String);
        const online = linked.filter((id) => io.sockets.adapter.rooms.has(`user:${id}`));

        // Even a call nobody could receive is stored, and becomes an alert
        if (online.length === 0) {
          Call.create({
            callId,
            senior: seniorId,
            notifiedCaregivers: [],
            status: "unavailable",
            endedAt: new Date(),
            endedBy: "system",
            endReason: "no_caregiver_online",
          }).catch((err) => console.error("Call save error:", err.message));

          createMissedCallAlert({ seniorId, seniorName, reason: "offline", callId, linkedIds: linked });

          return socket.emit("call:unavailable", {
            callId,
            message: "Votre aidant n'est pas connecté pour le moment. Essayez de l'appeler par téléphone.",
          });
        }

        const call = {
          callId,
          seniorId,
          seniorName,
          seniorSocketId: socket.id,
          linkedIds: linked, // ALL linked caregivers (online or not), used for the missed-call alert
          caregiverIds: new Set(online),
          rejected: new Set(),
          acceptedBy: null,
          acceptedSocketId: null,
          connectedAt: null,
          timer: null,
          dbReady: Call.create({
            callId,
            senior: seniorId,
            notifiedCaregivers: online,
            status: "ringing",
            startedAt: new Date(),
          }).catch((err) => console.error("Call save error:", err.message)),
        };

        // Nobody answered in time
        call.timer = setTimeout(() => {
          const current = calls.get(callId);
          if (!current || current.acceptedBy) return;
          finalize(callId, "missed", "system", "timeout");
          for (const id of current.caregiverIds) io.to(`user:${id}`).emit("call:cancelled", { callId });

          createMissedCallAlert({
            seniorId: current.seniorId,
            seniorName: current.seniorName,
            reason: "timeout",
            callId,
            linkedIds: current.linkedIds,
          });

          io.to(current.seniorSocketId).emit("call:unanswered", {
            callId,
            message: "Votre aidant n'a pas répondu. Réessayez ou appelez-le par téléphone.",
          });
        }, RING_TIMEOUT_MS);

        calls.set(callId, call);

        for (const id of online) {
          io.to(`user:${id}`).emit("call:incoming", { callId, seniorId, seniorName });
        }

        console.log(`📞 Call ${callId}: senior ${seniorId} → ${online.length} caregiver(s)`);
      } catch (error) {
        console.error("call:start error:", error);
        socket.emit("call:error", { callId, message: "Impossible de lancer l'appel." });
      }
    });

    /* ---------- 2. A caregiver accepts (first one wins) ---------- */
    socket.on("call:accept", ({ callId } = {}) => {
      const call = calls.get(callId);
      const userId = socket.data.userId;
      console.log("📲 call:accept", { callId, userId, found: !!call });

      if (!userId) {
        console.warn("call:accept ignored: socket has no userId");
        return socket.emit("call:error", { callId, message: "Authentification aidant manquante." });
      }

      if (!call || call.acceptedBy) return socket.emit("call:taken", { callId });

      if (!call.caregiverIds.has(userId)) {
        console.warn("call:accept ignored: user not linked to this senior", userId);
        return;
      }

      call.acceptedBy = userId;
      call.acceptedSocketId = socket.id;
      clearTimeout(call.timer);

      persist(call, { status: "in_progress", caregiver: userId, answeredAt: new Date() });

      io.to(call.seniorSocketId).emit("call:accepted", { callId, caregiverId: userId });
      console.log(`✅ Call ${callId} accepted by ${userId}`);

      const rooms = [...call.caregiverIds].map((id) => `user:${id}`);
      io.to(rooms).except(socket.id).emit("call:taken", { callId });
    });

    /* ---------- 3. A caregiver refuses ---------- */
    socket.on("call:reject", ({ callId } = {}) => {
      const call = calls.get(callId);
      const userId = socket.data.userId;
      if (!call || !userId || call.acceptedBy || !call.caregiverIds.has(userId)) return;

      call.rejected.add(userId);

      if (call.rejected.size >= call.caregiverIds.size) {
        finalize(callId, "rejected", "caregiver", "rejected");

        // Everyone refused: the call is still logged as a missed call for all linked caregivers
        createMissedCallAlert({
          seniorId: call.seniorId,
          seniorName: call.seniorName,
          reason: "rejected",
          callId,
          linkedIds: call.linkedIds,
        });

        io.to(call.seniorSocketId).emit("call:rejected", {
          callId,
          message: "Votre aidant est indisponible pour le moment.",
        });
      }
    });

    /* ---------- 4. WebRTC signaling ---------- */
    socket.on("call:offer", ({ callId, offer } = {}) => {
      const call = calls.get(callId);
      if (!call || !offer || socket.id !== call.seniorSocketId || !call.acceptedSocketId) return;
      console.log(`➡️ offer relayed for ${callId}`);
      io.to(call.acceptedSocketId).emit("call:offer", { callId, offer });
    });

    socket.on("call:answer", ({ callId, answer } = {}) => {
      const call = calls.get(callId);
      if (!call || !answer || socket.id !== call.acceptedSocketId) return;
      console.log(`⬅️ answer relayed for ${callId}`);
      io.to(call.seniorSocketId).emit("call:answer", { callId, answer });
    });

    socket.on("call:ice-candidate", ({ callId, candidate } = {}) => {
      const call = calls.get(callId);
      if (!call || !candidate || !call.acceptedSocketId) return;

      if (socket.id === call.seniorSocketId) {
        io.to(call.acceptedSocketId).emit("call:ice-candidate", { callId, candidate });
      } else if (socket.id === call.acceptedSocketId) {
        io.to(call.seniorSocketId).emit("call:ice-candidate", { callId, candidate });
      }
    });

    // A client says "the audio is connected" (the first report starts the clock)
    socket.on("call:connected", ({ callId } = {}) => {
      const call = calls.get(callId);
      if (!call || !call.acceptedSocketId || call.connectedAt) return;
      if (socket.id !== call.seniorSocketId && socket.id !== call.acceptedSocketId) return;

      call.connectedAt = new Date();
      persist(call, { connectedAt: call.connectedAt });
      console.log(`🎙️ Call ${callId} connected`);
    });

    /* ---------- 5. Hang up ---------- */
    socket.on("call:end", ({ callId } = {}) => endCall(socket, callId, "hangup"));

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
      for (const [callId, call] of calls) {
        if (call.seniorSocketId === socket.id || call.acceptedSocketId === socket.id) {
          endCall(socket, callId, "disconnected");
        }
      }
    });
  });

  return io;
}