import app from "./app.js";
import { connectDB } from "./config/db.js";

// Point d'entrée du backend : connexion à la base, puis démarrage du serveur
const PORT = process.env.PORT || 5000;

await connectDB(process.env.MONGODB_URI);

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
