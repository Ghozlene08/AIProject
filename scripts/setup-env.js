// Crée backend/.env à partir du modèle backend/.env.example s'il n'existe pas encore.
// Fonctionne sous Windows, macOS et Linux.
import { copyFileSync, existsSync } from "node:fs";

const from = "backend/.env.example";
const to = "backend/.env";

if (existsSync(to)) {
  console.log(`• ${to} existe déjà, non modifié`);
} else {
  copyFileSync(from, to);
  console.log(`✓ ${to} créé à partir de ${from}`);
}
