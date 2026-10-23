import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.js";

// Configuration de l'application Express
const app = express();

// Autorise le frontend (Next.js) à appeler ce serveur
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));

// Permet de lire le JSON envoyé dans les requêtes
app.use(express.json({ limit: "1mb" }));

// Toutes les routes de l'API sont préfixées par /api
app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
