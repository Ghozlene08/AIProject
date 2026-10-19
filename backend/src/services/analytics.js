import { AiCall, AiProvider, Alert, Intake, PlatformSettings, Senior, UsageEvent, User, WeeklySummary } from "../models/index.js";
import { addDays, startOfDay } from "../utils/dates.js";

/*
 * Indicateurs de l'administration, calculés uniquement à partir des données enregistrées :
 *  - UsageEvent : actions des seniors et des aidants (adoption, utilité, parcours)
 *  - AiCall     : appels aux services IA (qualité de service)
 *  - Alert, Intake, WeeklySummary : valeur pour les aidants
 * Une action enregistrée, une notification délivrée et une action accomplie sont comptées séparément.
 */

const DAY = 24 * 3600 * 1000;

export const MODULE_LABELS = {
  assistant: "Assistant vocal",
  agenda: "Agenda & rappels",
  documents: "Photo → Compris",
  souvenirs: "Souvenirs",
  famille: "Famille & sécurité",
  aidant: "Espace Aidant",
};

export const INTENT_LABELS = {
  consulter_agenda: "Consulter l'agenda",
  creer_rappel: "Créer un rappel",
  confirmer_prise: "Confirmer une prise",
  expliquer_document: "Expliquer un document",
  raconter_souvenir: "Raconter un souvenir",
  appeler_proche: "Appeler un proche",
  sos: "Déclencher un SOS",
  question_libre: "Question libre",
};

/* ---------- Outils ---------- */

export function periodOf(days = 7, end = new Date()) {
  const n = Math.min(Math.max(Number(days) || 7, 1), 90);
  const to = end;
  const from = startOfDay(addDays(end, -(n - 1)));
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = startOfDay(addDays(from, -n));
  return { days: n, from, to, prevFrom, prevTo };
}

const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, idx)];
}

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

const daysOf = ({ from, days }) => Array.from({ length: days }, (_, i) => addDays(from, i));

// Variation relative (en %) par rapport à la période précédente
const delta = (cur, prev) => (cur == null || prev == null || prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10);

export const maskName = (s, mask) => (mask ? `${s.firstName} ${s.lastName.charAt(0)}.` : `${s.firstName} ${s.lastName}`);

/* ---------- Données de base d'une période ---------- */

async function seniorEvents(from, to) {
  return UsageEvent.find({ actor: "senior", createdAt: { $gte: from, $lte: to } })
    .select("senior module action channel outcome intent step latencyMs failureReason createdAt")
    .lean();
}

async function firstActivityBySenior(until) {
  const rows = await UsageEvent.aggregate([
    { $match: { actor: "senior", createdAt: { $lte: until } } },
    { $group: { _id: "$senior", first: { $min: "$createdAt" }, last: { $max: "$createdAt" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { first: r.first, last: r.last }]));
}

/* ---------- Les quatre familles de KPI ---------- */

async function kpisFor(from, to) {
  const [events, calls, alerts, intakes, summaries, seniorsCount, activity] = await Promise.all([
    seniorEvents(from, to),
    AiCall.find({ createdAt: { $gte: from, $lte: to } }).select("status fallback latencyMs capability").lean(),
    Alert.find({ createdAt: { $gte: from, $lte: to }, type: { $ne: "synthese" } }).select("deliveredAt readAt severity").lean(),
    Intake.find({ scheduledAt: { $gte: from, $lte: to }, status: { $ne: "a_venir" } }).select("status").lean(),
    WeeklySummary.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Senior.countDocuments({ createdAt: { $lte: to } }),
    firstActivityBySenior(to),
  ]);

  // Adoption et engagement
  const active = new Set(events.map((e) => String(e.senior)));
  const retentionStart = new Date(to.getTime() - 7 * DAY);
  const cohort = [...activity.entries()].filter(([, a]) => a.first <= retentionStart);
  const retained = cohort.filter(([, a]) => a.last > retentionStart).length;

  // Utilité fonctionnelle
  const voice = events.filter((e) => e.channel === "voix");
  const voiceOk = voice.filter((e) => e.outcome === "reussi").length;
  const reminders = events.filter((e) => e.action === "rappel_cree");
  const docs = events.filter((e) => e.action === "document_traite");
  const intakeOk = intakes.filter((i) => i.status === "confirme").length;

  // Qualité de service IA
  const latencies = voice.map((e) => e.latencyMs).filter((v) => typeof v === "number");
  // La bascule de secours n'est journalisée que pour les LLM (les secours STT/TTS tournent dans le navigateur)
  const callErrors = calls.filter((c) => c.status === "erreur");
  const llm = calls.filter((c) => c.capability === "llm");
  const primaryErrors = llm.filter((c) => c.status === "erreur" && !c.fallback).length;
  const recovered = llm.filter((c) => c.fallback && c.status === "succes").length;
  const succeeded = llm.filter((c) => c.status === "succes").length;

  // Valeur pour les aidants
  const delivered = alerts.filter((a) => a.deliveredAt).length;
  const handled = alerts.filter((a) => a.readAt).length;

  return {
    adoption: {
      activeSeniors: active.size,
      seniorsTotal: seniorsCount,
      activationRate: pct(activity.size, seniorsCount),
      retention7: pct(retained, cohort.length),
      retentionCohort: cohort.length,
    },
    utility: {
      voiceSuccessRate: pct(voiceOk, voice.length),
      voiceRequests: voice.length,
      remindersCreated: reminders.filter((e) => e.outcome === "reussi").length,
      remindersFailed: reminders.filter((e) => e.outcome !== "reussi").length,
      intakeConfirmRate: pct(intakeOk, intakes.length),
      intakesDue: intakes.length,
      documentsSuccessRate: pct(docs.filter((e) => e.outcome === "reussi").length, docs.length),
      documents: docs.length,
    },
    quality: {
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      under4sRate: pct(latencies.filter((v) => v < 4000).length, latencies.length),
      aiCalls: calls.length,
      errorRate: pct(callErrors.length, calls.length),
      fallbackRate: pct(recovered, succeeded),
      recoveryRate: primaryErrors ? Math.min(100, pct(recovered, primaryErrors)) : null,
    },
    caregivers: {
      alertsCreated: alerts.length,
      alertsDelivered: delivered,
      deliveryRate: pct(delivered, alerts.length),
      alertsHandled: handled,
      handledRate: pct(handled, alerts.length),
      summariesGenerated: summaries,
    },
    _events: events,
  };
}

// Séries quotidiennes (sparklines et courbes)
function dailySeries(period, events, calls = []) {
  return daysOf(period).map((day) => {
    const k = dayKey(day);
    const evs = events.filter((e) => dayKey(e.createdAt) === k);
    const voice = evs.filter((e) => e.channel === "voix");
    const lat = voice.map((e) => e.latencyMs).filter((v) => typeof v === "number");
    const dayCalls = calls.filter((c) => dayKey(c.createdAt) === k);
    return {
      date: day,
      interactions: evs.length,
      activeSeniors: new Set(evs.map((e) => String(e.senior))).size,
      voiceRequests: voice.length,
      voiceSuccessRate: pct(voice.filter((e) => e.outcome === "reussi").length, voice.length),
      voiceShare: pct(voice.length, evs.length),
      latencyP50: percentile(lat, 50),
      latencyP95: percentile(lat, 95),
      aiCalls: dayCalls.length,
      aiErrors: dayCalls.filter((c) => c.status === "erreur").length,
    };
  });
}

function moduleBreakdown(events) {
  const total = events.length;
  return Object.keys(MODULE_LABELS)
    .map((m) => {
      const list = events.filter((e) => e.module === m);
      return {
        module: m,
        label: MODULE_LABELS[m],
        count: list.length,
        share: pct(list.length, total),
        success: list.filter((e) => e.outcome === "reussi").length,
        failure: list.filter((e) => e.outcome === "echec").length,
        abandon: list.filter((e) => e.outcome === "abandon").length,
      };
    })
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);
}

/* ---------- Vue d'ensemble ---------- */

export async function overview(days) {
  const period = periodOf(days);
  const settings = await PlatformSettings.get();
  const [cur, prev, calls, providers, recent, pending, roles, seniors] = await Promise.all([
    kpisFor(period.from, period.to),
    kpisFor(period.prevFrom, period.prevTo),
    AiCall.find({ createdAt: { $gte: period.from, $lte: period.to } }).select("status createdAt").lean(),
    providerQuality(period),
    recentActivity(8, settings.privacy.maskSeniorNames),
    pendingAlerts(),
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
    Senior.find().select("city").lean(),
  ]);
  const series = dailySeries(period, cur._events, calls);
  const { insights } = await import("./insights.js");

  return {
    period: { days: period.days, from: period.from, to: period.to },
    kpis: buildKpiCards(cur, prev, series),
    families: strip(cur),
    series,
    modules: moduleBreakdown(cur._events.concat(await aidantEvents(period))),
    providers: providers.byCapability,
    users: usersBreakdown(roles, seniors, settings.privacy.minGroupSize),
    insights: (await insights(period, cur, prev, settings, providers)).slice(0, 4),
    recent,
    pendingAlerts: pending,
    systemStatus: providers.status,
  };
}

const strip = (k) => ({ adoption: k.adoption, utility: k.utility, quality: k.quality, caregivers: k.caregivers });

async function aidantEvents(period) {
  return UsageEvent.find({ actor: "aidant", createdAt: { $gte: period.from, $lte: period.to } }).select("module outcome").lean();
}

// Les quatre cartes du tableau de bord : une par famille d'indicateurs
function buildKpiCards(cur, prev, series) {
  return [
    {
      key: "activeSeniors",
      family: "Adoption",
      label: "Seniors actifs",
      value: cur.adoption.activeSeniors,
      unit: "",
      delta: delta(cur.adoption.activeSeniors, prev.adoption.activeSeniors),
      better: "up",
      spark: series.map((d) => d.activeSeniors),
      hint: `sur ${cur.adoption.seniorsTotal} profils`,
      definition: "Nombre de seniors distincts ayant réalisé au moins une action (voix ou écran) sur la période.",
      source: "Événements d'usage (acteur senior)",
    },
    {
      key: "voiceSuccessRate",
      family: "Utilité",
      label: "Réussite des actions vocales",
      value: cur.utility.voiceSuccessRate,
      unit: "%",
      delta: delta(cur.utility.voiceSuccessRate, prev.utility.voiceSuccessRate),
      better: "up",
      spark: series.map((d) => d.voiceSuccessRate ?? 0),
      hint: `${cur.utility.voiceRequests.toLocaleString("fr-FR")} demandes vocales`,
      definition: "Intentions vocales réalisées jusqu'au bout ÷ intentions demandées par les seniors.",
      source: "Événements d'usage (canal voix)",
    },
    {
      key: "latencyP95",
      family: "Qualité IA",
      label: "Latence P95 de la réponse vocale",
      value: cur.quality.latencyP95 != null ? Math.round(cur.quality.latencyP95 / 100) / 10 : null,
      unit: "s",
      delta: delta(cur.quality.latencyP95, prev.quality.latencyP95),
      better: "down",
      spark: series.map((d) => d.latencyP95 ?? 0),
      hint: "objectif < 4 s",
      definition: "95 % des réponses vocales arrivent en moins de ce délai (de la fin de la demande au début de la réponse).",
      source: "Événements d'usage (latence mesurée par interaction)",
    },
    {
      key: "deliveryRate",
      family: "Aidants",
      label: "Alertes délivrées",
      value: cur.caregivers.deliveryRate,
      unit: "%",
      delta: delta(cur.caregivers.deliveryRate, prev.caregivers.deliveryRate),
      better: "up",
      spark: [],
      hint: `${cur.caregivers.alertsDelivered} / ${cur.caregivers.alertsCreated} alertes`,
      definition: "Alertes dont la délivrance est confirmée (réponse de Telegram ou affichage dans l'espace aidant) ÷ alertes créées.",
      source: "Alertes",
    },
  ];
}

async function recentActivity(limit, mask) {
  const events = await UsageEvent.find({ actor: { $in: ["senior", "aidant"] } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senior", "firstName lastName")
    .populate("user", "name")
    .lean();
  return events.map((e) => ({
    _id: e._id,
    at: e.createdAt,
    module: e.module,
    action: e.action,
    outcome: e.outcome,
    channel: e.channel,
    who: e.senior ? maskName(e.senior, mask) : e.user?.name ?? "—",
    actor: e.actor,
  }));
}

async function pendingAlerts() {
  const rows = await Alert.aggregate([
    { $match: { read: false, type: { $ne: "synthese" } } },
    { $group: { _id: "$severity", n: { $sum: 1 }, oldest: { $min: "$createdAt" } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r]));
  return ["haute", "moyenne", "info"].map((s) => ({ severity: s, count: by[s]?.n ?? 0, oldest: by[s]?.oldest ?? null }));
}

function usersBreakdown(roles, seniors, minGroup) {
  const byRole = Object.fromEntries(roles.map((r) => [r._id, r.n]));
  const counts = { seniors: seniors.length, aidants: byRole.aidant ?? 0, admins: byRole.admin ?? 0 };
  const total = counts.seniors + counts.aidants + counts.admins;
  // Confidentialité : les villes trop peu représentées sont regroupées
  const cities = {};
  for (const s of seniors) cities[s.city || "Non renseignée"] = (cities[s.city || "Non renseignée"] ?? 0) + 1;
  let other = 0;
  const sites = [];
  for (const [city, n] of Object.entries(cities).sort((a, b) => b[1] - a[1])) {
    if (n < minGroup) other += n;
    else sites.push({ city, count: n, share: pct(n, seniors.length) });
  }
  if (other) sites.push({ city: "Autres villes", count: other, share: pct(other, seniors.length) });
  return { total, ...counts, sites };
}

/* ---------- Analytique et tendances ---------- */

export async function analytics(days) {
  const period = periodOf(days);
  const [events, prevEvents] = await Promise.all([seniorEvents(period.from, period.to), seniorEvents(period.prevFrom, period.prevTo)]);
  const series = dailySeries(period, events);
  const prevSeries = dailySeries({ from: period.prevFrom, days: period.days }, prevEvents);

  // Entonnoir des interactions vocales
  const voice = events.filter((e) => e.channel === "voix" && e.step);
  const steps = ["Demande entendue", "Intention comprise", "Action confirmée", "Action réalisée"];
  const funnel = steps.map((label, i) => {
    const count = voice.filter((e) => e.step >= i + 1).length;
    return { step: i + 1, label, count, rate: pct(count, voice.length) };
  });

  // Carte thermique jour × heure
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const e of events) {
    const d = new Date(e.createdAt);
    heat[(d.getDay() + 6) % 7][d.getHours()] += 1;
  }

  // Réussite par intention vocale + principales causes d'échec
  const intents = Object.keys(INTENT_LABELS)
    .map((k) => {
      const list = voice.filter((e) => e.intent === k);
      const reasons = {};
      for (const e of list.filter((x) => x.outcome !== "reussi" && x.failureReason)) reasons[e.failureReason] = (reasons[e.failureReason] ?? 0) + 1;
      const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
      return {
        intent: k,
        label: INTENT_LABELS[k],
        requested: list.length,
        realized: list.filter((e) => e.outcome === "reussi").length,
        abandoned: list.filter((e) => e.outcome === "abandon").length,
        successRate: pct(list.filter((e) => e.outcome === "reussi").length, list.length),
        topFailure: topReason ? { reason: topReason[0], count: topReason[1] } : null,
      };
    })
    .filter((i) => i.requested > 0)
    .sort((a, b) => b.requested - a.requested);

  // Récurrence : nombre de jours actifs par senior actif sur la période
  const activeDays = {};
  for (const e of events) (activeDays[String(e.senior)] ??= new Set()).add(dayKey(e.createdAt));
  const counts = Object.values(activeDays).map((s) => s.size);
  const ratio = (n) => n / period.days;
  const recurrence = [
    { label: "Occasionnel", detail: "moins de 30 % des jours", count: counts.filter((n) => ratio(n) < 0.3).length },
    { label: "Régulier", detail: "30 à 70 % des jours", count: counts.filter((n) => ratio(n) >= 0.3 && ratio(n) < 0.7).length },
    { label: "Quotidien", detail: "70 % des jours ou plus", count: counts.filter((n) => ratio(n) >= 0.7).length },
  ];

  const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] ?? 0), 0);
  const voiceShare = pct(events.filter((e) => e.channel === "voix").length, events.length);
  const prevVoiceShare = pct(prevEvents.filter((e) => e.channel === "voix").length, prevEvents.length);

  return {
    period: { days: period.days, from: period.from, to: period.to },
    comparison: {
      interactions: { current: events.length, previous: prevEvents.length, delta: delta(events.length, prevEvents.length) },
      activeSeniors: {
        current: new Set(events.map((e) => String(e.senior))).size,
        previous: new Set(prevEvents.map((e) => String(e.senior))).size,
      },
      voiceShare: { current: voiceShare, previous: prevVoiceShare },
      avgPerDay: { current: Math.round(sum(series, "interactions") / period.days), previous: Math.round(sum(prevSeries, "interactions") / period.days) },
    },
    series,
    prevSeries,
    modules: moduleBreakdown(events),
    funnel,
    heatmap: heat,
    intents,
    recurrence,
  };
}

/* ---------- Utilisateurs (adoption, approche respectueuse de la vie privée) ---------- */

export async function usersStats(days) {
  const period = periodOf(days);
  const settings = await PlatformSettings.get();
  const [cur, prev, seniors, users, activity, periodActions] = await Promise.all([
    kpisFor(period.from, period.to),
    kpisFor(period.prevFrom, period.prevTo),
    Senior.find().select("firstName lastName city createdAt caregivers pairedAt").lean(),
    User.find().select("name role status lastLoginAt createdAt").lean(),
    firstActivityBySenior(period.to),
    UsageEvent.aggregate([
      { $match: { actor: "senior", createdAt: { $gte: period.from, $lte: period.to } } },
      { $group: { _id: "$senior", n: { $sum: 1 } } },
    ]),
  ]);

  const inactivityLimit = new Date(Date.now() - settings.thresholds.inactivityDays * DAY);
  const actions = Object.fromEntries(periodActions.map((r) => [String(r._id), r.n]));
  const newProfiles = seniors.filter((s) => s.createdAt >= period.from).length;
  const prevNewProfiles = seniors.filter((s) => s.createdAt >= period.prevFrom && s.createdAt <= period.prevTo).length;

  const seniorRows = seniors
    .map((s) => {
      const a = activity.get(String(s._id));
      const status = !a ? "jamais_active" : a.last < inactivityLimit ? "inactif" : "actif";
      return {
        _id: s._id,
        name: maskName(s, settings.privacy.maskSeniorNames),
        city: s.city ?? "—",
        caregivers: s.caregivers?.length ?? 0,
        createdAt: s.createdAt,
        lastActivity: a?.last ?? null,
        actions: actions[String(s._id)] ?? 0,
        status,
      };
    })
    .sort((a, b) => b.actions - a.actions);

  const aidants = users.filter((u) => u.role === "aidant");
  const inactiveAidants = aidants.filter((u) => u.status === "actif" && (!u.lastLoginAt || u.lastLoginAt < inactivityLimit));

  const newPerDay = daysOf(period).map((day) => ({
    date: day,
    count: seniors.filter((s) => dayKey(s.createdAt) === dayKey(day)).length,
  }));

  const analyticsData = await analytics(days);
  return {
    period: { days: period.days, from: period.from, to: period.to },
    kpis: {
      activeSeniors: { value: cur.adoption.activeSeniors, delta: delta(cur.adoption.activeSeniors, prev.adoption.activeSeniors) },
      newProfiles: { value: newProfiles, delta: delta(newProfiles, prevNewProfiles) },
      activationRate: { value: cur.adoption.activationRate },
      retention7: { value: cur.adoption.retention7, cohort: cur.adoption.retentionCohort },
      caregiversPerSenior: { value: seniors.length ? Math.round((seniors.reduce((s, x) => s + (x.caregivers?.length ?? 0), 0) / seniors.length) * 10) / 10 : null },
      inactiveAccounts: { value: seniorRows.filter((s) => s.status !== "actif").length + inactiveAidants.length },
    },
    statusBreakdown: ["actif", "inactif", "jamais_active"].map((s) => ({ status: s, count: seniorRows.filter((r) => r.status === s).length })),
    recurrence: analyticsData.recurrence,
    activeSeries: analyticsData.series.map((d) => ({ date: d.date, activeSeniors: d.activeSeniors })),
    newPerDay,
    roles: usersBreakdown(
      Object.entries(users.reduce((m, u) => ({ ...m, [u.role]: (m[u.role] ?? 0) + 1 }), {})).map(([_id, n]) => ({ _id, n })),
      seniors,
      settings.privacy.minGroupSize,
    ),
    seniors: seniorRows,
    inactiveAidants: inactiveAidants.map((u) => ({ _id: u._id, name: u.name, lastLoginAt: u.lastLoginAt ?? null })),
    inactivityDays: settings.thresholds.inactivityDays,
  };
}

/* ---------- Services IA ---------- */

export async function providerQuality(period) {
  const [providers, calls, today] = await Promise.all([
    AiProvider.find().sort({ capability: 1, priority: 1 }).lean(),
    AiCall.find({ createdAt: { $gte: period.from, $lte: period.to } }).select("provider capability status fallback latencyMs createdAt").lean(),
    AiCall.aggregate([{ $match: { createdAt: { $gte: startOfDay() } } }, { $group: { _id: "$provider", n: { $sum: 1 } } }]),
  ]);
  const usedToday = Object.fromEntries(today.map((r) => [r._id, r.n]));

  const statsOf = (list) => {
    const lat = list.map((c) => c.latencyMs).filter((v) => typeof v === "number");
    const errors = list.filter((c) => c.status === "erreur").length;
    return {
      calls: list.length,
      availability: pct(list.length - errors, list.length),
      errorRate: pct(errors, list.length),
      latencyP50: percentile(lat, 50),
      latencyP95: percentile(lat, 95),
    };
  };

  const byProvider = providers.map((p) => ({
    _id: p._id,
    key: p.key,
    name: p.name,
    capability: p.capability,
    role: p.role,
    model: p.model,
    enabled: p.enabled,
    simulateFailure: p.simulateFailure,
    dailyQuota: p.dailyQuota,
    usedToday: usedToday[p.name] ?? 0,
    quotaPct: p.dailyQuota ? pct(usedToday[p.name] ?? 0, p.dailyQuota) : null,
    ...statsOf(calls.filter((c) => c.provider === p.name)),
  }));

  const byCapability = ["llm", "stt", "tts", "ocr"].map((cap) => {
    const list = calls.filter((c) => c.capability === cap);
    const provs = byProvider.filter((p) => p.capability === cap);
    const succeeded = list.filter((c) => c.status === "succes").length;
    const recovered = list.filter((c) => c.fallback && c.status === "succes").length;
    const primaryErrors = list.filter((c) => c.status === "erreur" && !c.fallback).length;
    return {
      capability: cap,
      principal: provs.find((p) => p.role === "principal")?.name ?? provs[0]?.name ?? "—",
      fallbacks: provs.filter((p) => p.role === "secours").map((p) => p.name),
      ...statsOf(list),
      // Secours journalisé uniquement pour les LLM (passerelle) ; STT/TTS : secours navigateur ; OCR : aucun
      fallbackRate: cap === "llm" ? pct(recovered, succeeded) : null,
      recoveryRate: cap === "llm" && primaryErrors ? Math.min(100, pct(recovered, primaryErrors)) : null,
      fallbackNote: cap === "llm" ? null : cap === "ocr" ? "Aucun service tiers" : "Secours exécuté dans le navigateur",
      series: daysOf(period).map((day) => {
        const d = list.filter((c) => dayKey(c.createdAt) === dayKey(day));
        const lat = d.map((c) => c.latencyMs).filter((v) => typeof v === "number");
        return { date: day, calls: d.length, latencyP50: percentile(lat, 50), latencyP95: percentile(lat, 95), errors: d.filter((c) => c.status === "erreur").length };
      }),
    };
  });

  const degraded = byProvider.filter((p) => p.role === "principal" && (p.simulateFailure || !p.enabled));
  return {
    byProvider,
    byCapability,
    status: degraded.length
      ? { level: "degrade", label: "Service dégradé", detail: `${degraded.map((p) => p.name).join(", ")} indisponible — bascule de secours active` }
      : { level: "ok", label: "Système opérationnel", detail: "Tous les services principaux sont actifs" },
  };
}

export async function aiServices(days) {
  const period = periodOf(days);
  const settings = await PlatformSettings.get();
  const [quality, cur] = await Promise.all([providerQuality(period), kpisFor(period.from, period.to)]);
  const series = dailySeries(period, cur._events);
  return {
    period: { days: period.days, from: period.from, to: period.to },
    target: settings.thresholds.latencyP95TargetMs,
    quality: cur.quality,
    voiceLatency: series.map((d) => ({ date: d.date, p50: d.latencyP50, p95: d.latencyP95 })),
    ...quality,
  };
}

/* ---------- Rapport périodique ---------- */

export async function report(days) {
  const period = periodOf(days);
  const settings = await PlatformSettings.get();
  const [cur, prev, quality] = await Promise.all([kpisFor(period.from, period.to), kpisFor(period.prevFrom, period.prevTo), providerQuality(period)]);
  const { insights } = await import("./insights.js");
  return {
    period: { days: period.days, from: period.from, to: period.to },
    generatedAt: new Date(),
    current: strip(cur),
    previous: strip(prev),
    modules: moduleBreakdown(cur._events),
    providers: quality.byCapability.map(({ series: _s, ...rest }) => rest),
    insights: await insights(period, cur, prev, settings, quality),
  };
}

export { kpisFor };
