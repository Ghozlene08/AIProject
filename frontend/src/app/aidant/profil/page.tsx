import ProfilClient from "./ProfilClient";

// Cette page dépend de la session et de données chargées côté client.
export const instant = false;

export default function ProfilPage() {
  return <ProfilClient />;
}
