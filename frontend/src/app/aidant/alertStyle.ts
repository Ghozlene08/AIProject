import { Bell, BookHeart, CalendarDays, FileText, HeartPulse, Info, PhoneMissed, Siren, UserX } from "lucide-react";
import type { Alert } from "@/lib/types";

export const ALERT_STYLE: Record<Alert["type"], { icon: typeof Bell; tone: "danger" | "warn" | "brand"; label: string }> = {
  prise_manquee: { icon: HeartPulse, tone: "danger", label: "Prises manquées" },
  appel_manque: { icon: PhoneMissed, tone: "danger", label: "Appels manqués" },
  sos: { icon: Siren, tone: "danger", label: "SOS" },
  checkin_manque: { icon: UserX, tone: "danger", label: "Check-in manqué" },
  rdv: { icon: CalendarDays, tone: "brand", label: "Rendez-vous" },
  symptome: { icon: HeartPulse, tone: "warn", label: "Symptôme" },
  synthese: { icon: FileText, tone: "brand", label: "Synthèse" },
  souvenir_enregistre: { icon: BookHeart, tone: "brand", label: "Souvenir" }, // Module F4
  info: { icon: Info, tone: "brand", label: "Information" },
};

// Une donnée ancienne ou un nouveau type reçu de l'API ne doit pas casser la page.
export function getAlertStyle(type: unknown, severity?: Alert["severity"]): (typeof ALERT_STYLE)[Alert["type"]] {
  if (typeof type === "string" && Object.hasOwn(ALERT_STYLE, type)) return ALERT_STYLE[type as Alert["type"]];
  if (type === "rendez_vous") return { icon: CalendarDays, tone: "brand", label: "Rendez-vous" };
  return { icon: Bell, tone: severity === "haute" ? "danger" : severity === "moyenne" ? "warn" : "brand", label: "Autre alerte" };
}
