import { ConnexionReussie } from "../connexion-reussie/ConnexionReussie";

export const metadata = { title: "Mes médicaments" };
export const instant = false;
export default function MedicationsPage() {
  return <ConnexionReussie initialView="Médicaments" redirectMs={0} />;
}
