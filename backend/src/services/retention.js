import { AiCall, PlatformSettings, UsageEvent } from "../models/index.js";

// Supprime les journaux plus anciens que la durée de conservation configurée (confidentialité)
export async function purgeOldLogs() {
  const settings = await PlatformSettings.get();
  const limit = new Date(Date.now() - settings.privacy.logRetentionDays * 24 * 3600 * 1000);
  const [calls, events] = await Promise.all([
    AiCall.deleteMany({ createdAt: { $lt: limit } }),
    UsageEvent.deleteMany({ createdAt: { $lt: limit } }),
  ]);
  if (calls.deletedCount || events.deletedCount) {
    console.log(`🧹 Journaux purgés : ${calls.deletedCount} appels IA, ${events.deletedCount} événements`);
  }
}
