import { redirect } from "next/navigation";

export const metadata = { title: "Connexion Senior" };
export default function SeniorConnectionPage() {
  redirect("/connexion?espace=senior");
}
