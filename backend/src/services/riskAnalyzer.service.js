
import Alert from "../models/Alert.js";
import { analyzeRiskData } from "./llama.service.js";

export async function analyzeSeniorRisk(seniorId) {
  // Analyser les alertes des 7 derniers jours
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const alerts = await Alert.find({
    senior: seniorId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("type severity title message read createdAt")
    .lean();

  const summary = {
    period: {
      from: since.toISOString(),
      to: new Date().toISOString(),
      days: 7,
    },
    totalAlerts: alerts.length,
    countsByType: {},
    countsBySeverity: {},
    recentEvents: alerts.map((alert) => ({
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message || "",
      read: alert.read,
      date: alert.createdAt,
    })),
  };

  for (const alert of alerts) {
    summary.countsByType[alert.type] =
      (summary.countsByType[alert.type] || 0) + 1;

    summary.countsBySeverity[alert.severity] =
      (summary.countsBySeverity[alert.severity] || 0) + 1;
  }

  const result = await analyzeRiskData(summary);

  return {
    period: summary.period,
    totalAlerts: summary.totalAlerts,
    countsByType: summary.countsByType,
    countsBySeverity: summary.countsBySeverity,
    analysis: result.analysis,
    model: result.model,
  };
}
