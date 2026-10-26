import crypto from "node:crypto";
import QRCode from "qrcode";
import { User } from "../models/index.js";
import { sendTelegram } from "./notifier.js";

/*
 * Liaison du compte Telegram d'un aidant, sans rien copier à la main :
 * Paramètres → « Connecter Telegram » → Telegram s'ouvre sur le robot avec un code à usage unique
 * → l'aidant appuie sur « Démarrer » → le serveur reconnaît le code et enregistre la conversation.
 * Le serveur interroge Telegram (getUpdates) : aucune adresse publique n'est nécessaire (localhost).
 */

const LINK_TTL_MS = 15 * 60000;
const codes = new Map(); // code → { userId, expires }
let bot = null; // { username, name }

const token = () => process.env.TELEGRAM_BOT_TOKEN;
const api = (method) => `https://api.telegram.org/bot${token()}/${method}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const telegramConfigured = () => Boolean(token());

export async function botInfo() {
  if (!token()) return null;
  if (bot) return bot;
  try {
    const res = await fetch(api("getMe"), { signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    if (j.ok) bot = { username: j.result.username, name: j.result.first_name };
  } catch {
    /* réseau indisponible : réessayé au prochain appel */
  }
  return bot;
}

/**
 * Liaison valable 15 minutes : lien t.me (application Telegram), le même lien en QR code
 * (à scanner avec le téléphone) et un code court à envoyer au robot si rien d'autre ne marche.
 */
export async function createLink(userId) {
  const info = await botInfo();
  if (!info) return null;
  for (const [c, v] of codes) if (v.expires < Date.now()) codes.delete(c);
  // Code court et lisible (sans 0/O ni 1/I) : facile à recopier
  const code = Array.from(crypto.randomBytes(6), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  codes.set(code, { userId: String(userId), expires: Date.now() + LINK_TTL_MS });
  const url = `https://t.me/${info.username}?start=${code}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  return { url, qr, code, bot: info.username };
}

async function handleMessage(msg) {
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  // « /start CODE » (lien ou QR code) ou le code seul, envoyé à la main
  const m = msg.text.trim().toUpperCase().match(/^(?:\/START\s+)?([A-Z0-9]{6})$/);
  const key = m?.[1];
  const entry = key ? codes.get(key) : null;
  if (!key) {
    await sendTelegram(chatId, "Bonjour ! Ce robot envoie les alertes de Senior Assistant à l'aidant.\nPour le relier à votre compte : Espace aidant → Paramètres → « Connecter Telegram », puis envoyez ici le code affiché.");
    return;
  }
  if (!entry || entry.expires < Date.now()) {
    await sendTelegram(chatId, "Ce code a expiré ou n'est pas reconnu. Retournez dans Paramètres et cliquez de nouveau sur « Connecter Telegram ».");
    return;
  }
  codes.delete(key);
  const user = await User.findById(entry.userId);
  if (!user) return;
  user.notifications.telegram = true;
  user.notifications.telegramChatId = chatId;
  await user.save();
  await sendTelegram(
    chatId,
    `✅ C'est fait, ${user.name.split(" ")[0]} ! Vous recevrez ici les alertes importantes : SOS, prise manquée, rendez-vous médical noté par votre proche, et un résumé chaque soir.\nPour arrêter : Paramètres → « Déconnecter ».`,
  );
}

let started = false;

/** Écoute le robot (long polling). Sans jeton configuré, ne fait rien. */
export function startTelegramBot() {
  if (started || !token()) return;
  started = true;
  let offset = 0;
  let warnedConflict = false;
  (async () => {
    for (;;) {
      try {
        const url = `${api("getUpdates")}?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent('["message"]')}`;
        const j = await (await fetch(url, { signal: AbortSignal.timeout(35000) })).json();
        if (!j.ok) {
          // 409 : un autre serveur écoute déjà ce robot (deux backends lancés en même temps)
          if (j.error_code === 409 && !warnedConflict) console.warn("⚠️  Telegram : un autre serveur écoute déjà ce robot");
          warnedConflict = warnedConflict || j.error_code === 409;
          await sleep(j.error_code === 409 ? 30000 : 5000);
          continue;
        }
        for (const u of j.result) {
          offset = u.update_id + 1;
          await handleMessage(u.message).catch((err) => console.error("❌ Telegram :", err.message));
        }
      } catch {
        await sleep(5000); // réseau coupé : on réessaie
      }
    }
  })();
  botInfo().then((b) => b && console.log(`🤖 Robot Telegram @${b.username} à l'écoute`));
}
