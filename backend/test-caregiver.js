
import { io } from "socket.io-client";

// Replace this with the actual caregiver's MongoDB _id.
const caregiverId = "6ad511ecef8a94c2f2c5a969";

const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("✅ Connected to backend:", socket.id);

  // Ask the development server to join this caregiver's room.
  socket.emit("test:join-caregiver", caregiverId);
});

socket.on("test:joined", (data) => {
  console.log("✅ Caregiver room joined:", data.message);
  console.log("Waiting for an SOS alert...");
});

socket.on("sos:alert", (alert) => {
  console.log("\n🚨 SOS ALERT RECEIVED!");
  console.log(JSON.stringify(alert, null, 2));
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error.message);
});

socket.on("disconnect", () => {
  console.log("🔌 Disconnected from backend.");
});
