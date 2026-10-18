import type { Metadata } from "next";
import { ConnexionReussie } from "./ConnexionReussie";

export const metadata: Metadata = { title: "Connexion réussie" };

// Écran affiché après la reconnaissance faciale du senior.
// Page autonome : données fictives, aucun appel API, aucun lien vers les autres pages
// (le routage et le branchement des données seront faits par l'équipe).
export default function ConnexionReussiePage() {
  return <ConnexionReussie />;
}
