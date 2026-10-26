import { ConnexionReussie } from "../connexion-reussie/ConnexionReussie";

export const metadata = { title: "Mon agenda" };
export const instant = false;
export default function AgendaPage() {
  return <ConnexionReussie initialView="Agenda" redirectMs={0} />;
}
