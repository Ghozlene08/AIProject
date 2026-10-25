import { Bell, BookHeart, CalendarDays, FileText, HeartPulse, Info, PhoneMissed, Pill, Siren, UserX } from "lucide-react";
import type { Alert } from "@/lib/types";

export const ALERT_STYLE: Record<Alert["type"], { icon: typeof Bell; tone: "danger" | "warn" | "brand"; label: string }> = {
  prise_manquee: { icon: Pill, tone: "danger", label: "Prise manquée" },
  appel_manque: { icon: PhoneMissed, tone: "danger", label: "Appels manqués" },
  checkin_manque: { icon: UserX, tone: "danger", label: "Check-in manqué" },
  sos: { icon: Siren, tone: "danger", label: "SOS" },
  rdv: { icon: CalendarDays, tone: "warn", label: "Rendez-vous" },
  symptome: { icon: HeartPulse, tone: "warn", label: "Symptôme" },
  synthese: { icon: FileText, tone: "brand", label: "Synthèse" },
  souvenir_enregistre: { icon: BookHeart, tone: "brand", label: "Souvenir" }, // Module F4
  info: { icon: Info, tone: "brand", label: "Information" },
};
