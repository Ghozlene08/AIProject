import { Bell, CalendarDays, FileText, HeartPulse, Info, Pill, Siren, UserX } from "lucide-react";
import type { Alert } from "@/lib/types";

export const ALERT_STYLE: Record<Alert["type"], { icon: typeof Bell; tone: "danger" | "warn" | "brand"; label: string }> = {
  prise_manquee: { icon: Pill, tone: "danger", label: "Prise manquée" },
  sos: { icon: Siren, tone: "danger", label: "SOS" },
  checkin_manque: { icon: UserX, tone: "danger", label: "Check-in manqué" }, // ← NEW
  rdv: { icon: CalendarDays, tone: "warn", label: "Rendez-vous" },
  symptome: { icon: HeartPulse, tone: "warn", label: "Symptôme" },
  synthese: { icon: FileText, tone: "brand", label: "Synthèse" },
  info: { icon: Info, tone: "brand", label: "Information" },
};