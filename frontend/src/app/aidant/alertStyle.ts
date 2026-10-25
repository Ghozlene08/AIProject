import { Bell, CalendarDays, FileText, HeartPulse, Info, PhoneMissed, Siren, UserX } from "lucide-react";
import type { Alert } from "@/lib/types";

export const ALERT_STYLE: Record<Alert["type"], { icon: typeof Bell; tone: "danger" | "warn" | "brand"; label: string }> = {
  appel_manque: { icon: PhoneMissed, tone: "danger", label: "Appels manqués" },
  sos: { icon: Siren, tone: "danger", label: "SOS" },
  checkin_manque: { icon: UserX, tone: "danger", label: "Check-in manqué" },
  synthese: { icon: FileText, tone: "brand", label: "Synthèse" },
  info: { icon: Info, tone: "brand", label: "Information" },
};