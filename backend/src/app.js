import express from "express";
import cors from "cors";

// Configuration de l'application Express.
// Aucune route pour l'instant : elles seront ajoutées dans src/routes/.
const app = express();

// Autorise le frontend (Next.js) à appeler ce serveur plus tard
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));

// Permet de lire le JSON envoyé dans les requêtes
app.use(express.json());

export default app;
