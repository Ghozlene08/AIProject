import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { configureSocket } from "./config/socket.js";
import { startScheduler } from "./services/scheduler.js";
import { startCheckInScheduler } from "./services/checkInScheduler.js";
import { ensureProviders } from "./services/ai/defaults.js";

// Port du backend
const PORT = process.env.PORT || 5000;

// Connexion à MongoDB
const connected = await connectDB(process.env.MONGODB_URI);

if (connected) {
  await ensureProviders();
  startScheduler();
}

// Création du serveur HTTP
const server = http.createServer(app);

// Initialisation de Socket.IO
const io = configureSocket(server);

// Rendre Socket.IO accessible aux contrôleurs Express
app.set("io", io);

// Démarrage du serveur
server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);

  // Le scheduler de check-in a besoin de Socket.IO ET de la base de données.
  // On le lance une fois le serveur prêt, pour que les caregivers puissent
  // déjà se connecter au socket quand la première escalade part.
  if (connected) {
    startCheckInScheduler(io);
  }
});