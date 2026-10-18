import { Alert, User } from "../models/index.js";

// Envoie un message Telegram (si TELEGRAM_BOT_TOKEN est configuré)
export async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    console.warn("⚠️  Telegram indisponible :", err.message);
    return false;
  }
}

// Crée une alerte et prévient les aidants qui ont activé Telegram
export async function raiseAlert(senior, { type, severity = "moyenne", title, message }) {
  const alert = await Alert.create({ senior: senior._id, type, severity, title, message });
  const caregivers = await User.find({
    _id: { $in: senior.caregivers },
    "notifications.telegram": true,
    "notifications.telegramChatId": { $exists: true, $ne: "" },
  });
  const text = `🔔 Senior Assistant — ${senior.firstName} ${senior.lastName}\n${title}${message ? `\n${message}` : ""}`;
  const results = await Promise.all(caregivers.map((u) => sendTelegram(u.notifications.telegramChatId, text)));
  if (results.some(Boolean)) {
    alert.sentTelegram = true;
    alert.deliveredAt = new Date();
    await alert.save();
  }
  return alert;
}
