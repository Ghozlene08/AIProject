import { redirect } from "next/navigation";

// L'espace senior s'ouvre par la reconnaissance faciale (plus de code PIN)
export default function SeniorPage() {
  redirect("/connexion?espace=senior");
}
