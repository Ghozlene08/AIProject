import { Alert } from "../models/index.js";
import { generateText } from "./ai/gateway.js";
import { INTENT_LABELS, MODULE_LABELS } from "./analytics.js";

/*
 * Insights & recommandations, en deux temps :
 *  1. des règles déterministes calculent les constats chiffrés à partir des indicateurs réels ;
 *  2. un LLM gratuit (Groq → Gemini → OpenRouter, via la passerelle IA) rédige les recommandations
 *     à partir de ces seuls faits. Sa réponse est validée (JSON, champs, chiffres présents dans les
 *     données) ; sans LLM disponible ou si la réponse est invalide, les règles servent de repli.
 */

const SEVERITY_ORDER = { critique: 0, attention: 1, info: 2, ok: 3 };
const fmt = (n, d = 1) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const sec = (ms) => `${fmt(ms / 1000)} s`;

// Action conseillée selon la cause d'échec la plus fréquente d'une intention vocale
const FAILURE_ACTIONS = {
  horaire_non_identifie: "Ajouter une confirmation vocale de l'horaire (« À 20 heures, c'est bien cela ? ») avant l'enregistrement.",
  intention_non_comprise: "Enrichir les exemples de formulations dans le prompt de détection d'intention.",
  audio_inaudible: "Inviter le senior à répéter plus près du micro et vérifier le niveau sonore avant l'envoi.",
  contact_inconnu: "Proposer la liste des proches enregistrés lorsque le nom prononcé n'est pas reconnu.",
  document_illisible: "Guider la prise de vue (cadrage, lumière) avant l'analyse OCR.",
  delai_depasse: "Réduire la taille du prompt ou basculer plus tôt vers le fournisseur de secours.",
};

export const FAILURE_LABELS = {
  horaire_non_identifie: "horaire non identifié",
  intention_non_comprise: "intention non comprise",
  audio_inaudible: "audio inaudible",
  contact_inconnu: "contact inconnu",
  document_illisible: "document illisible",
  delai_depasse: "délai dépassé",
  aucune_prise_due: "aucune prise à confirmer",
  erreur_serveur: "erreur technique",
};

// Règles déterministes : constats chiffrés (et recommandations de repli si aucun LLM n'est disponible)
export async function ruleInsights(period, cur, prev, settings, quality) {
  const t = settings.thresholds;
  const out = [];
  const add = (i) => out.push({ id: `regle-${out.length}`, source: "regles", ...i });
  const events = cur._events ?? [];
  const label = `les ${period.days} derniers jours`;

  /* ----- Qualité de service : réactivité ----- */
  const p95 = cur.quality.latencyP95;
  if (p95 != null) {
    if (p95 > t.latencyP95TargetMs) {
      add({
        category: "Performance",
        module: "Dialogue vocal",
        severity: "critique",
        title: "Objectif de réactivité non tenu",
        observation: `Le temps de réponse vocale P95 atteint ${sec(p95)} sur ${label}, au-delà de l'objectif de ${sec(t.latencyP95TargetMs)}. ${fmt(cur.quality.under4sRate)} % des réponses arrivent en moins de 4 s.`,
        action: "Comparer la latence des fournisseurs dans « Services IA » et réduire la taille des prompts du dialogue.",
        metric: `P95 ${sec(p95)}`,
      });
    } else {
      add({
        category: "Performance",
        module: "Dialogue vocal",
        severity: "ok",
        title: "Objectif de réactivité respecté",
        observation: `Le temps de réponse P95 est de ${sec(p95)} sur ${label}, sous l'objectif de ${sec(t.latencyP95TargetMs)} (${fmt(cur.quality.under4sRate)} % des réponses en moins de 4 s).`,
        action: "Surveiller la tendance et comparer régulièrement les performances des fournisseurs.",
        metric: `P95 ${sec(p95)}`,
      });
    }
  }

  /* ----- Utilité : intentions vocales ----- */
  const voice = events.filter((e) => e.channel === "voix" && e.intent);
  const byIntent = {};
  for (const e of voice) (byIntent[e.intent] ??= []).push(e);
  for (const [intent, list] of Object.entries(byIntent)) {
    if (list.length < 15) continue; // échantillon trop faible pour conclure
    const ok = list.filter((e) => e.outcome === "reussi").length;
    const rate = (ok / list.length) * 100;
    if (rate >= t.voiceSuccessMin) continue;
    const reasons = {};
    for (const e of list.filter((x) => x.outcome !== "reussi" && x.failureReason)) reasons[e.failureReason] = (reasons[e.failureReason] ?? 0) + 1;
    const [reason, n] = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] ?? [];
    add({
      category: "Utilité",
      module: INTENT_LABELS[intent] ?? intent,
      severity: rate < t.voiceSuccessMin - 15 ? "critique" : "attention",
      title: `« ${INTENT_LABELS[intent] ?? intent} » échoue trop souvent`,
      observation: `${fmt(rate)} % de réussite (${ok} / ${list.length}) sur ${label}, sous le seuil de ${t.voiceSuccessMin} %.${reason ? ` Première cause : ${FAILURE_LABELS[reason] ?? reason} (${n} cas).` : ""}`,
      action: FAILURE_ACTIONS[reason] ?? "Analyser les journaux de cette intention pour identifier l'étape bloquante.",
      metric: `${fmt(rate)} %`,
    });
  }

  /* ----- Utilité : rappels de prise et documents ----- */
  const intakeRate = cur.utility.intakeConfirmRate;
  if (intakeRate != null && intakeRate < t.intakeConfirmMin) {
    add({
      category: "Utilité",
      module: "Agenda & rappels",
      severity: "attention",
      title: "Prises de médicaments insuffisamment confirmées",
      observation: `${fmt(intakeRate)} % des prises ont été confirmées sur ${label} (seuil ${t.intakeConfirmMin} %, ${cur.utility.intakesDue} prises dues).`,
      action: "Rendre le rappel vocal plus explicite et envisager un second rappel plus rapproché.",
      metric: `${fmt(intakeRate)} %`,
    });
  }
  const docRate = cur.utility.documentsSuccessRate;
  if (docRate != null && cur.utility.documents >= 10 && docRate < t.documentSuccessMin) {
    add({
      category: "Utilité",
      module: "Photo → Compris",
      severity: "attention",
      title: "Documents trop souvent non expliqués",
      observation: `${fmt(docRate)} % des documents ont été lus et expliqués avec succès (${cur.utility.documents} documents, seuil ${t.documentSuccessMin} %).`,
      action: FAILURE_ACTIONS.document_illisible,
      metric: `${fmt(docRate)} %`,
    });
  }

  /* ----- Qualité IA : fournisseurs, secours, quotas ----- */
  for (const p of quality.byProvider) {
    if (p.calls >= 20 && p.errorRate > t.errorRateMax) {
      add({
        category: "Qualité IA",
        module: p.name,
        severity: "critique",
        title: `Taux d'erreur élevé pour ${p.name}`,
        observation: `${fmt(p.errorRate)} % d'erreurs sur ${p.calls} appels (seuil ${t.errorRateMax} %).`,
        action: "Consulter les journaux filtrés sur ce fournisseur et, si besoin, inverser l'ordre de bascule dans Configuration.",
        metric: `${fmt(p.errorRate)} %`,
      });
    }
    if (p.quotaPct != null && p.quotaPct >= t.quotaWarnPct) {
      add({
        category: "Qualité IA",
        module: p.name,
        severity: p.quotaPct >= 100 ? "critique" : "attention",
        title: `Quota gratuit de ${p.name} bientôt atteint`,
        observation: `${p.usedToday} requêtes aujourd'hui sur ${p.dailyQuota} autorisées (${fmt(p.quotaPct)} %).`,
        action: "Répartir la charge vers le fournisseur de secours avant l'épuisement du quota.",
        metric: `${fmt(p.quotaPct)} %`,
      });
    }
  }
  if (cur.quality.fallbackRate != null && cur.quality.fallbackRate > t.fallbackRateMax) {
    add({
      category: "Qualité IA",
      module: "Passerelle IA",
      severity: "attention",
      title: "Recours fréquent aux fournisseurs de secours",
      observation: `${fmt(cur.quality.fallbackRate)} % des appels réussis ont été servis par un secours (seuil ${t.fallbackRateMax} %).`,
      action: "Vérifier la clé et le quota du fournisseur principal.",
      metric: `${fmt(cur.quality.fallbackRate)} %`,
    });
  }
  if (cur.quality.recoveryRate != null && cur.quality.recoveryRate < 95) {
    add({
      category: "Qualité IA",
      module: "Passerelle IA",
      severity: "critique",
      title: "Des pannes ne sont pas rattrapées par le secours",
      observation: `Seules ${fmt(cur.quality.recoveryRate)} % des erreurs du fournisseur principal ont été récupérées par un secours.`,
      action: "Activer un second fournisseur de secours pour cette capacité.",
      metric: `${fmt(cur.quality.recoveryRate)} %`,
    });
  }

  /* ----- Adoption ----- */
  const a = cur.adoption;
  const pa = prev.adoption;
  if (pa.activeSeniors && a.activeSeniors < pa.activeSeniors * 0.9) {
    add({
      category: "Adoption",
      module: "Seniors actifs",
      severity: "attention",
      title: "Baisse du nombre de seniors actifs",
      observation: `${a.activeSeniors} seniors actifs contre ${pa.activeSeniors} sur la période précédente.`,
      action: "Repérer les comptes devenus inactifs dans « Utilisateurs » et prévenir leurs aidants.",
      metric: `${a.activeSeniors}`,
    });
  } else if (pa.activeSeniors && a.activeSeniors > pa.activeSeniors * 1.1) {
    add({
      category: "Adoption",
      module: "Seniors actifs",
      severity: "ok",
      title: "L'adoption progresse",
      observation: `${a.activeSeniors} seniors actifs contre ${pa.activeSeniors} sur la période précédente.`,
      action: "Maintenir l'accompagnement des nouveaux profils lors de leur première semaine.",
      metric: `+${a.activeSeniors - pa.activeSeniors}`,
    });
  }
  if (a.activationRate != null && a.activationRate < 75) {
    const never = Math.round(a.seniorsTotal * (1 - a.activationRate / 100));
    add({
      category: "Adoption",
      module: "Activation",
      severity: "attention",
      title: "Des profils n'ont jamais été utilisés",
      observation: `${fmt(a.activationRate)} % des profils ont réalisé une première action ; ${never} profil(s) n'ont jamais été utilisés.`,
      action: "Proposer aux aidants un guide de première utilisation et vérifier l'appairage de l'appareil.",
      metric: `${fmt(a.activationRate)} %`,
    });
  }
  if (a.retention7 != null && a.retentionCohort >= 5 && a.retention7 < 60) {
    add({
      category: "Adoption",
      module: "Rétention",
      severity: "attention",
      title: "Rétention à 7 jours faible",
      observation: `${fmt(a.retention7)} % des seniors activés depuis plus de 7 jours sont revenus au cours des 7 derniers jours.`,
      action: "Activer le briefing vocal du matin pour créer un rendez-vous quotidien avec l'assistant.",
      metric: `${fmt(a.retention7)} %`,
    });
  }

  /* ----- Usage des modules ----- */
  const totalEvents = events.length;
  if (totalEvents >= 50) {
    for (const m of Object.keys(MODULE_LABELS).filter((k) => k !== "aidant")) {
      const n = events.filter((e) => e.module === m).length;
      const share = (n / totalEvents) * 100;
      if (share < 5) {
        add({
          category: "Adoption",
          module: MODULE_LABELS[m],
          severity: "info",
          title: `${MODULE_LABELS[m]} reste peu utilisé`,
          observation: `${fmt(share)} % des actions des seniors sur ${label} (${n} actions).`,
          action: "Faire suggérer cette fonctionnalité par l'assistant au moment opportun.",
          metric: `${fmt(share)} %`,
        });
      }
    }
  }

  /* ----- Valeur pour les aidants ----- */
  const c = cur.caregivers;
  if (c.deliveryRate != null && c.alertsCreated >= 5 && c.deliveryRate < 95) {
    add({
      category: "Aidants",
      module: "Alertes",
      severity: "critique",
      title: "Des alertes ne sont pas délivrées",
      observation: `${c.alertsDelivered} alertes délivrées sur ${c.alertsCreated} (${fmt(c.deliveryRate)} %). Une alerte non délivrée n'a pas pu prévenir l'aidant.`,
      action: "Inviter les aidants concernés à activer Telegram dans leurs paramètres.",
      metric: `${fmt(c.deliveryRate)} %`,
    });
  }
  const pendingHigh = await Alert.countDocuments({ read: false, severity: "haute" });
  if (pendingHigh > 0) {
    add({
      category: "Aidants",
      module: "Alertes",
      severity: pendingHigh >= 5 ? "critique" : "attention",
      title: "Alertes prioritaires en attente",
      observation: `${pendingHigh} alerte(s) de priorité haute n'ont pas encore été consultées par un aidant.`,
      action: "Relancer les aidants concernés ; ajouter un second contact d'urgence si l'alerte reste sans réponse.",
      metric: `${pendingHigh}`,
    });
  }

  return out.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
}

/* =====================================================================
 * Recommandations rédigées par un LLM gratuit, ancrées sur les faits
 * ===================================================================== */

const CATEGORIES = ["Adoption", "Utilité", "Performance", "Qualité IA", "Aidants"];
const SEVERITIES = ["critique", "attention", "info", "ok"];
const NO_LLM = "__AUCUN_LLM_DISPONIBLE__";
const CACHE_TTL_MS = 60 * 60 * 1000; // une génération par heure et par période : économise le quota gratuit
const cache = new Map(); // clé : durée de la période

// À appeler quand les seuils ou les fournisseurs changent (les recommandations doivent suivre)
export const clearInsightsCache = () => cache.clear();

// Résumé factuel transmis au LLM : uniquement des agrégats, aucune donnée nominative
export function buildFacts(period, cur, prev, settings, quality, rules) {
  const t = settings.thresholds;
  const a = cur.adoption;
  const u = cur.utility;
  const q = cur.quality;
  const c = cur.caregivers;
  const lines = [
    `Période analysée : ${period.days} derniers jours (comparée aux ${period.days} jours précédents).`,
    `ADOPTION — seniors actifs : ${a.activeSeniors} (période précédente : ${prev.adoption.activeSeniors}) sur ${a.seniorsTotal} profils ; taux d'activation : ${fmt(a.activationRate)} % ; rétention à 7 jours : ${fmt(a.retention7)} %.`,
    `UTILITÉ — réussite des actions vocales : ${fmt(u.voiceSuccessRate)} % sur ${u.voiceRequests} demandes (seuil ${t.voiceSuccessMin} %) ; rappels créés : ${u.remindersCreated}, échoués : ${u.remindersFailed} ; prises confirmées : ${fmt(u.intakeConfirmRate)} % sur ${u.intakesDue} prises (seuil ${t.intakeConfirmMin} %) ; documents expliqués : ${fmt(u.documentsSuccessRate)} % sur ${u.documents} (seuil ${t.documentSuccessMin} %).`,
    `QUALITÉ IA — latence vocale P50 : ${sec(q.latencyP50)}, P95 : ${sec(q.latencyP95)} (objectif ${sec(t.latencyP95TargetMs)}) ; réponses en moins de 4 s : ${fmt(q.under4sRate)} % ; taux d'erreur : ${fmt(q.errorRate)} % sur ${q.aiCalls} appels ; bascule LLM : ${fmt(q.fallbackRate)} % ; récupération : ${fmt(q.recoveryRate)} %.`,
    `FOURNISSEURS — ${quality.byProvider.filter((p) => p.calls > 0).map((p) => `${p.name} : ${p.calls} appels, ${fmt(p.errorRate)} % d'erreurs${p.quotaPct != null ? `, quota du jour ${fmt(p.quotaPct)} %` : ""}`).join(" ; ")}.`,
    `AIDANTS — alertes créées : ${c.alertsCreated} ; délivrées : ${c.alertsDelivered} (${fmt(c.deliveryRate)} %) ; traitées : ${c.alertsHandled} (${fmt(c.handledRate)} %) ; synthèses générées : ${c.summariesGenerated}.`,
    "CONSTATS CALCULÉS :",
    ...rules.map((r) => `- [${r.severity}] ${r.category} / ${r.module} : ${r.title}. ${r.observation}`),
  ];
  return lines.join("\n");
}

// Nombres d'un texte, normalisés (« 1 205 » → 1205, « 92,5 » → 92.5)
function numbersIn(text) {
  const clean = String(text).replace(/(\d)[\s  ](?=\d{3}\b)/g, "$1");
  return (clean.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
}

/**
 * Valide la réponse du LLM. Une recommandation est rejetée si un champ manque, si une valeur
 * sort des listes autorisées ou si elle cite un chiffre absent des faits (anti-hallucination).
 */
export function parseLlmInsights(text, facts) {
  const json = String(text).replace(/```(?:json)?/g, "").trim();
  const start = json.indexOf("[");
  const end = json.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let items;
  try {
    items = JSON.parse(json.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];

  const known = new Set(numbersIn(facts));
  const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  return items
    .slice(0, 6)
    .map((it) => {
      const category = CATEGORIES.find((c) => c.toLowerCase() === String(it?.category ?? "").toLowerCase());
      const severity = SEVERITIES.includes(it?.severity) ? it.severity : null;
      const title = str(it?.title, 100);
      const observation = str(it?.observation, 360);
      const action = str(it?.action, 260);
      if (!category || !severity || !title || !observation || !action) return null;
      // Chaque chiffre cité doit exister dans les données (les petits entiers restent tolérés)
      const invented = numbersIn(`${title} ${observation}`).some((n) => n > 10 && !known.has(n));
      if (invented) return null;
      return { category, severity, title, observation, action, module: str(it?.module, 40) ?? category, metric: str(it?.metric, 24) ?? "" };
    })
    .filter(Boolean);
}

export async function insights(period, cur, prev, settings, quality) {
  const rules = await ruleInsights(period, cur, prev, settings, quality);
  const facts = buildFacts(period, cur, prev, settings, quality, rules);
  // Clé par période (et non par empreinte des faits : la consommation de quota, qui fait partie
  // des faits, augmente à chaque appel et empêcherait toute réutilisation)
  const key = period.days;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = llmInsights(facts, rules);
  // La promesse est mise en cache tout de suite : deux pages ouvertes ensemble ne font qu'un appel
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  const result = await value;
  if (result.every((i) => i.source === "regles")) cache.set(key, { value, expires: Date.now() + 5 * 60 * 1000 });
  return result;
}

async function llmInsights(facts, rules) {
  const system = [
    "Tu es l'analyste de la plateforme Senior Assistant (assistance vocale pour personnes âgées et leurs aidants).",
    "À partir des seuls faits fournis, rédige 3 à 5 recommandations pour l'administrateur, en français, classées de la plus urgente à la moins urgente.",
    "Règles strictes :",
    "- Utilise uniquement les chiffres présents dans les faits, recopiés à l'identique (même arrondi). N'invente aucun chiffre.",
    "- Chaque recommandation : une observation factuelle chiffrée + une action concrète et réalisable par l'équipe.",
    "- Aucun conseil médical. Pas de nom de personne.",
    `- category parmi : ${CATEGORIES.join(", ")}. severity parmi : critique, attention, info, ok.`,
    "- Réponds UNIQUEMENT par un tableau JSON, sans texte autour, de la forme :",
    '[{"category":"Utilité","module":"Créer un rappel","severity":"attention","title":"…","observation":"…","action":"…","metric":"75 %"}]',
  ].join("\n");

  let result;
  try {
    result = await generateText({
      task: "Insights administrateur",
      system,
      prompt: facts,
      maxTokens: 1400,
      localFallback: () => NO_LLM,
    });
  } catch {
    return rules;
  }
  if (result.text === NO_LLM) return rules;

  const parsed = parseLlmInsights(result.text, facts);
  if (!parsed.length) return rules;

  const llm = parsed.map((i, n) => ({ id: `ia-${n}`, source: "ia", provider: result.provider, ...i }));
  // Sécurité : un constat critique des règles ne doit jamais disparaître
  const missing = rules.filter(
    (r) => r.severity === "critique" && !llm.some((i) => i.module.toLowerCase() === r.module.toLowerCase() || i.title.toLowerCase().includes(r.module.toLowerCase())),
  );
  return [...llm, ...missing].sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
}
