export type Role = "aidant" | "admin";

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  status: "actif" | "inactif";
  phone?: string;
  notifications?: { email: boolean; telegram: boolean; telegramChatId?: string; sms: boolean };
  lastLoginAt?: string;
  createdAt: string;
  seniors?: number;
}

export interface Senior {
  _id: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  age?: number | null;
  phone?: string;
  address?: string;
  city?: string;
  doctor?: { name?: string; specialty?: string; phone?: string };
  medicalNotes?: string;
  pairingCode?: string;
  pairedAt?: string;
  lastSeenAt?: string;
  consentAI?: boolean;
  createdAt: string;
}

export interface Contact {
  _id: string;
  name: string;
  relation?: string;
  phone: string;
  isEmergency?: boolean;
  order?: number;
}

export interface Medication {
  _id: string;
  name: string;
  dosage?: string;
  posology?: string;
  times: string[];
  instructions?: string;
  active: boolean;
}

export type IntakeStatus = "a_venir" | "confirme" | "manque";

export interface Intake {
  _id: string;
  medication: { _id: string; name: string; dosage?: string } | null;
  scheduledAt: string;
  status: IntakeStatus;
  confirmedAt?: string;
  reminders: number;
}

export type EventType = "rdv" | "repas" | "activite" | "autre";

export interface AgendaEvent {
  _id: string;
  title: string;
  type: EventType;
  startAt: string;
  location?: string;
  notes?: string;
  createdBy: "aidant" | "senior" | "ia";
  status: "prevu" | "fait" | "annule";
}

export type AlertType = "prise_manquee" | "sos" | "rdv" | "symptome" | "synthese" | "info";

export interface Alert {
  _id: string;
  type: AlertType;
  severity: "haute" | "moyenne" | "info";
  title: string;
  message?: string;
  read: boolean;
  sentTelegram?: boolean;
  createdAt: string;
}

export interface WeeklyStats {
  intakesTotal: number;
  intakesConfirmed: number;
  intakesMissed: number;
  adherence: number;
  events: number;
  alerts: number;
}

export interface WeeklySummary {
  _id: string;
  periodStart: string;
  periodEnd: string;
  content: string;
  stats: WeeklyStats;
  provider?: string;
  createdAt: string;
}

export interface Dashboard {
  senior: Senior;
  online: boolean;
  intakes: { list: Intake[]; confirmed: number; total: number };
  todayEvents: number;
  nextEvent: AgendaEvent | null;
  upcoming: { kind: string; at: string; title: string; detail?: string }[];
  alerts: Alert[];
  unreadAlerts: number;
  lastSummary: WeeklySummary | null;
}

export interface AdherenceDay {
  date: string;
  total: number;
  confirmed: number;
  missed: number;
  rate: number | null;
}

export interface AiProvider {
  _id: string;
  key: string;
  name: string;
  capability: "llm" | "stt" | "tts" | "ocr";
  model?: string;
  role: "principal" | "secours";
  priority: number;
  enabled: boolean;
  simulateFailure: boolean;
  description?: string;
  configured: boolean;
  operational?: boolean;
  calls?: number;
  successRate?: number | null;
  latencyMs?: number | null;
}

export interface AiCall {
  _id: string;
  task: string;
  capability: string;
  provider?: string;
  model?: string;
  status: "succes" | "erreur";
  fallback: boolean;
  latencyMs?: number;
  promptPreview?: string;
  tokens?: string[];
  error?: string;
  createdAt: string;
}

export interface AdminOverview {
  providers: AiProvider[];
  today: { calls: number; errorRate: number; successRate: number; fallbacks: number; latencyMs: number };
  hourly: { hour: string; calls: number; errors: number; latencyMs: number }[];
  recent: AiCall[];
  counts: { users: number; seniors: number };
}
