// Types des réponses de l'API d'analytique (backend/src/services/analytics.js)

export interface Period {
  days: number;
  from: string;
  to: string;
}

export interface KpiCardData {
  key: string;
  family: string;
  label: string;
  value: number | null;
  unit: string;
  delta: number | null;
  better: "up" | "down";
  spark: number[];
  hint: string;
  definition: string;
  source: string;
}

export interface DayPoint {
  date: string;
  interactions: number;
  activeSeniors: number;
  voiceRequests: number;
  voiceSuccessRate: number | null;
  voiceShare: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  aiCalls: number;
  aiErrors: number;
}

export interface ModuleStat {
  module: string;
  label: string;
  count: number;
  share: number | null;
  success: number;
  failure: number;
  abandon: number;
}

export interface CapabilityStat {
  capability: "llm" | "stt" | "tts" | "ocr";
  principal: string;
  fallbacks: string[];
  calls: number;
  availability: number | null;
  errorRate: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  fallbackRate: number | null;
  recoveryRate: number | null;
  fallbackNote: string | null;
  series: { date: string; calls: number; latencyP50: number | null; latencyP95: number | null; errors: number }[];
}

export interface ProviderStat {
  _id: string;
  key: string;
  name: string;
  capability: "llm" | "stt" | "tts" | "ocr";
  role: "principal" | "secours";
  model?: string;
  enabled: boolean;
  simulateFailure: boolean;
  dailyQuota: number | null;
  usedToday: number;
  quotaPct: number | null;
  calls: number;
  availability: number | null;
  errorRate: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
}

export interface Insight {
  id: string;
  category: string;
  module: string;
  severity: "critique" | "attention" | "info" | "ok";
  title: string;
  observation: string;
  action: string;
  metric: string;
  /** « ia » : rédigée par un LLM gratuit à partir des faits ; « regles » : règle déterministe */
  source?: "ia" | "regles";
  provider?: string;
}

export interface Families {
  adoption: { activeSeniors: number; seniorsTotal: number; activationRate: number | null; retention7: number | null; retentionCohort: number };
  utility: {
    voiceSuccessRate: number | null;
    voiceRequests: number;
    remindersCreated: number;
    remindersFailed: number;
    intakeConfirmRate: number | null;
    intakesDue: number;
    documentsSuccessRate: number | null;
    documents: number;
  };
  quality: {
    latencyP50: number | null;
    latencyP95: number | null;
    under4sRate: number | null;
    aiCalls: number;
    errorRate: number | null;
    fallbackRate: number | null;
    recoveryRate: number | null;
  };
  caregivers: {
    alertsCreated: number;
    alertsDelivered: number;
    deliveryRate: number | null;
    alertsHandled: number;
    handledRate: number | null;
    summariesGenerated: number;
  };
}

export interface UsersBreakdown {
  total: number;
  seniors: number;
  aidants: number;
  admins: number;
  sites: { city: string; count: number; share: number | null }[];
}

export interface Overview {
  period: Period;
  kpis: KpiCardData[];
  families: Families;
  series: DayPoint[];
  modules: ModuleStat[];
  providers: CapabilityStat[];
  users: UsersBreakdown;
  insights: Insight[];
  recent: { _id: string; at: string; module: string; action: string; outcome: string; channel: string; who: string; actor: string }[];
  pendingAlerts: { severity: "haute" | "moyenne" | "info"; count: number; oldest: string | null }[];
  systemStatus: { level: "ok" | "degrade"; label: string; detail: string };
}

export interface Analytics {
  period: Period;
  comparison: {
    interactions: { current: number; previous: number; delta: number | null };
    activeSeniors: { current: number; previous: number };
    voiceShare: { current: number | null; previous: number | null };
    avgPerDay: { current: number; previous: number };
  };
  series: DayPoint[];
  prevSeries: DayPoint[];
  modules: ModuleStat[];
  funnel: { step: number; label: string; count: number; rate: number | null }[];
  heatmap: number[][];
  intents: { intent: string; label: string; requested: number; realized: number; abandoned: number; successRate: number | null; topFailure: { reason: string; count: number } | null }[];
  recurrence: { label: string; detail: string; count: number }[];
}

export interface UsersStats {
  period: Period;
  kpis: {
    activeSeniors: { value: number; delta: number | null };
    newProfiles: { value: number; delta: number | null };
    activationRate: { value: number | null };
    retention7: { value: number | null; cohort: number };
    caregiversPerSenior: { value: number | null };
    inactiveAccounts: { value: number };
  };
  statusBreakdown: { status: "actif" | "inactif" | "jamais_active"; count: number }[];
  recurrence: { label: string; detail: string; count: number }[];
  activeSeries: { date: string; activeSeniors: number }[];
  newPerDay: { date: string; count: number }[];
  roles: UsersBreakdown;
  seniors: { _id: string; name: string; city: string; caregivers: number; createdAt: string; lastActivity: string | null; actions: number; status: "actif" | "inactif" | "jamais_active" }[];
  inactiveAidants: { _id: string; name: string; lastLoginAt: string | null }[];
  inactivityDays: number;
}

export interface AiServices {
  period: Period;
  target: number;
  quality: Families["quality"];
  voiceLatency: { date: string; p50: number | null; p95: number | null }[];
  byProvider: ProviderStat[];
  byCapability: CapabilityStat[];
  status: Overview["systemStatus"];
}

export interface Report {
  period: Period;
  generatedAt: string;
  current: Families;
  previous: Families;
  modules: ModuleStat[];
  providers: Omit<CapabilityStat, "series">[];
  insights: Insight[];
}

export interface PlatformSettings {
  thresholds: {
    latencyP95TargetMs: number;
    errorRateMax: number;
    fallbackRateMax: number;
    voiceSuccessMin: number;
    intakeConfirmMin: number;
    documentSuccessMin: number;
    inactivityDays: number;
    quotaWarnPct: number;
  };
  privacy: { logRetentionDays: number; storePromptPreview: boolean; maskSeniorNames: boolean; minGroupSize: number };
}
