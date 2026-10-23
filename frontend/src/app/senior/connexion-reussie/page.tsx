import type { Metadata } from "next";
import { ConnexionReussie } from "./ConnexionReussie";

export const metadata: Metadata = { title: "Connexion réussie" };

// Écran affiché après la reconnaissance faciale du senior.
// Accueil de démonstration avec assistant vocal F1 et connexion optionnelle du profil.
export default function ConnexionReussiePage() {
  return <ConnexionReussie />;
}
