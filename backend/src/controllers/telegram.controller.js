import { Senior } from "../models/index.js";
import { badRequest } from "../utils/httpError.js";
import { eveningSummary } from "../services/agenda/caregiver.js";
import { sendTelegram } from "../services/notifier.js";
import { botInfo, createLink, telegramConfigured } from "../services/telegramBot.js";

// Liaison Telegram de l'aidant connecté (Paramètres → Notifications)

const linked = (user) => Boolean(user.notifications?.telegram && user.notifications?.telegramChatId);

export async function status(req, res) {
  const bot = await botInfo();
  res.json({ configured: telegramConfigured() && Boolean(bot), bot: bot?.username ?? null, linked: linked(req.user) });
}

export async function link(req, res) {
  const out = await createLink(req.user._id);
  if (!out) throw badRequest("Telegram n'est pas configuré sur ce serveur");
  res.json(out);
}

export async function test(req, res) {
  if (!linked(req.user)) throw badRequest("Telegram n'est pas encore connecté");
  const chatId = req.user.notifications.telegramChatId;
  const ok = await sendTelegram(chatId, "🔔 Senior Assistant — message de test.\nTout fonctionne : vous recevrez ici les alertes importantes.");
  if (!ok) throw badRequest("Le message n'a pas pu être envoyé. Reconnectez Telegram.");
  // Aperçu du résumé du soir (envoyé automatiquement à 19 h) pour les seniors suivis
  const seniors = await Senior.find({ caregivers: req.user._id }).sort({ createdAt: 1 }).limit(3);
  let previews = 0;
  for (const s of seniors) {
    const summary = await eveningSummary(s).catch(() => null);
    if (summary && (await sendTelegram(chatId, `🔔 Senior Assistant — ${s.firstName} ${s.lastName}\nRésumé de la journée (aperçu)\n${summary}`))) previews++;
  }
  res.json({ ok: true, previews });
}

export async function unlink(req, res) {
  req.user.notifications.telegram = false;
  req.user.notifications.telegramChatId = null;
  await req.user.save();
  res.json({ ok: true });
}
