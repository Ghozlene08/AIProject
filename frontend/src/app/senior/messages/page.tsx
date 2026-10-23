import { ConnexionReussie } from "../connexion-reussie/ConnexionReussie";

export const metadata = { title: "Mes messages" };
export default function MessagesPage() {
  return <ConnexionReussie initialView="Messages" redirectMs={0} />;
}
