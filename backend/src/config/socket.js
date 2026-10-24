import { Server } from "socket.io";
import jwt from "jsonwebtoken";

export function configureSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // ---------- Verified authentication ----------
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      // Anonymous sockets are tolerated only in development (for the test:* events)
      if (process.env.NODE_ENV !== "production") return next();
      return next(new Error("Authentification requise."));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Your token stores the user id in `sub`
      socket.data.userId = String(payload.sub || payload.id || payload._id);
      next();
    } catch {
      next(new Error("Token invalide."));
    }
  });

  io.on("connection", (socket) => {
    console.log("✅ Socket connected:", socket.id);

    // Every authenticated user joins their private room automatically.
    // This is the room triggerSOS() emits "sos:alert" to.
    if (socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
      console.log(`👤 User ${socket.data.userId} joined room user:${socket.data.userId}`);
    }

    // ---------- Temporary local testing only ----------
    socket.on("test:join-caregiver", (caregiverId) => {
      if (
        process.env.NODE_ENV !== "production" &&
        typeof caregiverId === "string" &&
        /^[a-f\d]{24}$/i.test(caregiverId)
      ) {
        socket.join(`user:${caregiverId}`);
        console.log(`👤 Test caregiver joined: ${caregiverId}`);
        socket.emit("test:joined", { message: "Caregiver joined successfully." });
      }
    });


    

    socket.on("test:join-user", (userId) => {
      if (
        process.env.NODE_ENV !== "production" &&
        typeof userId === "string" &&
        /^[a-f\d]{24}$/i.test(userId)
      ) {
        socket.join(`user:${userId}`);
        console.log(`🧪 Test user joined room: ${userId}`);
        socket.emit("test:user-joined", { userId });
      }
    });

    // ---------- Calls ----------
    socket.on("call:initiate", ({ callId, caregiverId, seniorId }) => {
      if (
        typeof callId !== "string" ||
        typeof caregiverId !== "string" ||
        typeof seniorId !== "string"
      ) {
        return socket.emit("call:error", { message: "Invalid call information." });
      }

      const room = `user:${caregiverId}`;

      if (!io.sockets.adapter.rooms.has(room)) {
        return socket.emit("call:error", { callId, message: "Caregiver is not connected." });
      }

      io.to(room).emit("call:incoming", { callId, seniorId });
      console.log(`📞 Incoming call ${callId} for caregiver ${caregiverId}`);
    });

    socket.on("call:offer", ({ targetUserId, callId, offer }) => {
      if (typeof targetUserId !== "string" || typeof callId !== "string" || !offer) return;
      socket.to(`user:${targetUserId}`).emit("call:offer", { callId, offer });
    });

    socket.on("call:answer", ({ targetUserId, callId, answer }) => {
      if (typeof targetUserId !== "string" || typeof callId !== "string" || !answer) return;
      socket.to(`user:${targetUserId}`).emit("call:answer", { callId, answer });
    });

    socket.on("call:ice-candidate", ({ targetUserId, callId, candidate }) => {
      if (typeof targetUserId !== "string" || typeof callId !== "string" || !candidate) return;
      socket.to(`user:${targetUserId}`).emit("call:ice-candidate", { callId, candidate });
    });

    socket.on("call:reject", ({ targetUserId, callId }) => {
      if (typeof targetUserId !== "string") return;
      socket.to(`user:${targetUserId}`).emit("call:rejected", { callId });
    });

    socket.on("call:end", ({ targetUserId, callId }) => {
      if (typeof targetUserId !== "string") return;
      socket.to(`user:${targetUserId}`).emit("call:ended", { callId });
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });

  return io;
}