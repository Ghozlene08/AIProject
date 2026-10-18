import { AiCall, PlatformSettings, UsageEvent } from "../models/index.js";
import * as analytics from "../services/analytics.js";
import { clearInsightsCache, insights } from "../services/insights.js";
import { badRequest } from "../utils/httpError.js";

export async function overview(req, res) {
  res.json(await analytics.overview(req.query.days));
}

export async function trends(req, res) {
  res.json(await analytics.analytics(req.query.days));
}

export async function users(req, res) {
  res.json(await analytics.usersStats(req.query.days));
}

export async function aiServices(req, res) {
  res.json(await analytics.aiServices(req.query.days));
}

export async function insightsList(req, res) {
  const period = analytics.periodOf(req.query.days);
  const settings = await PlatformSettings.get();
  const [cur, prev, quality] = await Promise.all([
    analytics.kpisFor(period.from, period.to),
    analytics.kpisFor(period.prevFrom, period.prevTo),
    analytics.providerQuality(period),
  ]);
  res.json({ insights: await insights(period, cur, prev, settings, quality) });
}

export async function report(req, res) {
  res.json(await analytics.report(req.query.days));
}

/* ---------- Export CSV (aucune donnée nominative) ---------- */

const csvCell = (v) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");

export async function exportCsv(req, res) {
  const { type = "kpis" } = req.query;
  const period = analytics.periodOf(req.query.days);
  const range = { $gte: period.from, $lte: period.to };
  let csv;

  if (type === "kpis") {
    const r = await analytics.report(req.query.days);
    const rows = [];
    for (const [family, values] of Object.entries(r.current)) {
      for (const [k, v] of Object.entries(values)) rows.push([family, k, v, r.previous[family]?.[k]]);
    }
    csv = toCsv(["famille", "indicateur", "periode", "periode_precedente"], rows);
  } else if (type === "events") {
    const events = await UsageEvent.find({ createdAt: range }).sort({ createdAt: -1 }).limit(50000).lean();
    csv = toCsv(
      ["date", "acteur", "module", "action", "canal", "resultat", "intention", "etape", "cause_echec", "latence_ms"],
      events.map((e) => [e.createdAt, e.actor, e.module, e.action, e.channel, e.outcome, e.intent, e.step, e.failureReason, e.latencyMs]),
    );
  } else if (type === "ai-calls") {
    const calls = await AiCall.find({ createdAt: range }).sort({ createdAt: -1 }).limit(50000).lean();
    csv = toCsv(
      ["date", "tache", "capacite", "fournisseur", "modele", "statut", "secours", "latence_ms", "erreur"],
      calls.map((c) => [c.createdAt, c.task, c.capability, c.provider, c.model, c.status, c.fallback ? "oui" : "non", c.latencyMs, c.error]),
    );
  } else {
    throw badRequest("Type d'export inconnu (kpis, events, ai-calls)");
  }

  const name = `senior-assistant-${type}-${period.days}j.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(csv);
}

/* ---------- Réglages de la plateforme ---------- */

export async function getSettings(_req, res) {
  res.json({ settings: await PlatformSettings.get() });
}

export async function updateSettings(req, res) {
  const settings = await PlatformSettings.get();
  const { thresholds, privacy } = req.body ?? {};
  for (const [k, v] of Object.entries(thresholds ?? {})) {
    if (k in settings.thresholds.toObject()) settings.thresholds[k] = Number(v);
  }
  for (const [k, v] of Object.entries(privacy ?? {})) {
    if (k in settings.privacy.toObject()) settings.privacy[k] = typeof settings.privacy[k] === "boolean" ? Boolean(v) : Number(v);
  }
  await settings.save();
  clearInsightsCache();
  res.json({ settings });
}
