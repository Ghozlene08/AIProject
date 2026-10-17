import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startScheduler } from "./services/scheduler.js";
import { ensureProviders } from "./services/ai/defaults.js";

// Point d'entrée du backend : connexion à la base, puis démarrage du serveur
const PORT = process.env.PORT || 5000;

const connected = await connectDB(process.env.MONGODB_URI);

if (connected) {
  await ensureProviders();
  startScheduler();
}

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
