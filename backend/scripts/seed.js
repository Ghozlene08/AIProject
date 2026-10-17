// Remplit la base avec des données de démonstration : npm run seed
// ⚠️ Vide d'abord toutes les collections de l'application.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { AiCall, AiProvider, Alert, Contact, Event, Intake, Medication, Senior, User, WeeklySummary } from "../src/models/index.js";
import { ensureProviders } from "../src/services/ai/defaults.js";
import { generateWeeklySummary } from "../src/services/summary.js";
import { addDays, atTime, startOfDay } from "../src/utils/dates.js";

if (!(await connectDB(process.env.MONGODB_URI))) process.exit(1);

// Générateur pseudo-aléatoire déterministe : mêmes données à chaque seed
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];

console.log("🧹 Nettoyage des collections…");
await Promise.all([User, Senior, Contact, Medication, Intake, Event, Alert, WeeklySummary, AiCall, AiProvider].map((M) => M.deleteMany({})));
await ensureProviders();

/* ---------- Comptes ---------- */
const hash = (p) => bcrypt.hash(p, 10);
const [admin, sophie, samir] = await User.create([
  { name: "Admin Plateforme", email: "admin@senior-assistant.tn", passwordHash: await hash("Admin123!"), role: "admin" },
  { name: "Sophie Martin", email: "sophie.martin@exemple.com", passwordHash: await hash("Aidant123!"), role: "aidant", phone: "06 11 22 33 44" },
  { name: "Samir Ben Ali", email: "samir@exemple.com", passwordHash: await hash("Aidant123!"), role: "aidant" },
  { name: "Leila Khelifi", email: "leila@exemple.com", passwordHash: await hash("Aidant123!"), role: "aidant", status: "inactif" },
]);

/* ---------- Senior ---------- */
const marie = await Senior.create({
  firstName: "Marie",
  lastName: "Dupont",
  birthDate: new Date(new Date().getFullYear() - 72, 2, 14),
  phone: "06 12 34 56 78",
  address: "12 rue de Marseille",
  city: "Tunis",
  doctor: { name: "Dr. Ben Salem", specialty: "Médecin traitant", phone: "71 234 567" },
  medicalNotes: "Hypertension légère. Allergie à la pénicilline.",
  caregivers: [sophie._id],
  pairingCode: "MARIE7",
  pinHash: await hash("1234"),
  pairedAt: addDays(new Date(), -5),
  lastSeenAt: new Date(),
});

await Senior.create({
  firstName: "Ahmed",
  lastName: "Ben Ali",
  birthDate: new Date(new Date().getFullYear() - 80, 6, 2),
  city: "Sousse",
  caregivers: [samir._id],
  pairingCode: "AHMED8",
  pinHash: await hash("4321"),
});

await Contact.create([
  { senior: marie._id, name: "Sophie Martin", relation: "Fille", phone: "06 11 22 33 44", isEmergency: true, order: 1 },
  { senior: marie._id, name: "Thomas Martin", relation: "Fils", phone: "06 22 33 44 55", isEmergency: true, order: 2 },
  { senior: marie._id, name: "Léa Martin", relation: "Petite-fille", phone: "06 33 44 55 66", order: 3 },
  { senior: marie._id, name: "Dr. Ben Salem", relation: "Médecin traitant", phone: "71 234 567", order: 4 },
  { senior: marie._id, name: "M. Haddad", relation: "Voisin", phone: "06 44 55 66 77", order: 5 },
]);

/* ---------- Traitements et prises ---------- */
const meds = await Medication.create([
  { senior: marie._id, name: "Paracétamol", dosage: "1 g", posology: "1 comprimé", times: ["08:30"], instructions: "Pendant le petit déjeuner" },
  { senior: marie._id, name: "Aspirine", dosage: "75 mg", posology: "1 comprimé", times: ["20:00"], instructions: "Après le dîner" },
  { senior: marie._id, name: "Vitamine D", dosage: "1000 UI", posology: "1 comprimé", times: ["12:00"] },
]);

const now = new Date();
const intakes = [];
for (let d = -7; d <= 1; d++) {
  const day = startOfDay(addDays(now, d));
  for (const med of meds) {
    for (const t of med.times) {
      const at = atTime(day, t);
      let status = "a_venir";
      if (at.getTime() < now.getTime() - 30 * 60000) {
        // Un oubli plus fréquent le soir (Aspirine) : ~87 % d'observance
        const missChance = med.name === "Aspirine" ? 0.3 : 0.06;
        status = d < 0 && rand() < missChance ? "manque" : "confirme";
      }
      intakes.push({
        senior: marie._id,
        medication: med._id,
        scheduledAt: at,
        status,
        confirmedAt: status === "confirme" ? new Date(at.getTime() + 4 * 60000) : undefined,
        reminders: status === "manque" ? 2 : 0,
      });
    }
  }
}
await Intake.insertMany(intakes);

/* ---------- Agenda ---------- */
const today = startOfDay(now);
await Event.create([
  { senior: marie._id, title: "Petit déjeuner avec ma fille", type: "repas", startAt: atTime(today, "10:00"), location: "À la maison" },
  { senior: marie._id, title: "Rendez-vous médical", type: "rdv", startAt: atTime(today, "14:00"), location: "Cabinet Dr. Ben Salem — Cardiologie" },
  { senior: marie._id, title: "Consultation cardiologique", type: "rdv", startAt: atTime(addDays(today, 3), "10:30"), location: "CHU La Rabta" },
  { senior: marie._id, title: "Atelier mémoire", type: "activite", startAt: atTime(addDays(today, 5), "15:00"), location: "Club des aînés" },
  { senior: marie._id, title: "Prise de sang", type: "rdv", startAt: atTime(addDays(today, -3), "09:00"), location: "Laboratoire Pasteur", status: "fait", createdBy: "senior" },
]);

/* ---------- Alertes ---------- */
const missed = intakes.filter((i) => i.status === "manque").sort((a, b) => b.scheduledAt - a.scheduledAt);
const fmt = (d) => d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
for (const m of missed.slice(0, 3)) {
  const med = meds.find((x) => x._id.equals(m.medication));
  const a = await Alert.create({
    senior: marie._id,
    type: "prise_manquee",
    severity: "haute",
    title: "Prise manquée",
    message: `${med.name} ${med.dosage} — ${fmt(m.scheduledAt)}, non confirmée après 2 rappels`,
    read: m !== missed[0],
  });
  await Alert.updateOne({ _id: a._id }, { createdAt: new Date(m.scheduledAt.getTime() + 30 * 60000) }, { timestamps: false });
}
const rdvAlert = await Alert.create({
  senior: marie._id,
  type: "rdv",
  severity: "moyenne",
  title: "Rappel rendez-vous",
  message: `Consultation cardiologique — ${fmt(atTime(addDays(today, 3), "10:30"))}`,
});
await Alert.updateOne({ _id: rdvAlert._id }, { createdAt: atTime(today, "08:20") }, { timestamps: false });
await Alert.create({
  senior: marie._id,
  type: "symptome",
  severity: "moyenne",
  title: "Symptôme inhabituel",
  message: "Marie a mentionné des vertiges à l'assistant vocal mardi matin.",
  read: true,
});

/* ---------- Historique des appels IA (7 jours) ---------- */
const TASKS = [
  { task: "Dialogue", capability: "llm", w: 40 },
  { task: "Extraction de faits", capability: "llm", w: 12 },
  { task: "Simplification de document", capability: "llm", w: 6 },
  { task: "Souvenir", capability: "llm", w: 6 },
  { task: "Briefing du matin", capability: "llm", w: 5 },
  { task: "Reconnaissance vocale", capability: "stt", w: 35 },
  { task: "Synthèse vocale", capability: "tts", w: 35 },
  { task: "OCR", capability: "ocr", w: 4 },
];
const PROMPTS = [
  "[PERSONNE_1] demande : « Qu'ai-je prévu aujourd'hui ? »",
  "[PERSONNE_1] : « Rappelle-moi de prendre mon médicament à 20h. »",
  "[PERSONNE_1] : « Appelle ma fille [PERSONNE_2]. »",
  "Extraire les faits : « Mon médecin s'appelle [PERSONNE_3], son numéro est [TEL_1]. »",
  "Simplifier le courrier adressé à [PERSONNE_1] : pièces justificatives à fournir avant le 30 octobre.",
  "Raconter un souvenir : voyage de [PERSONNE_1] à Sidi Bou Saïd en 1968.",
];
const totalW = TASKS.reduce((s, t) => s + t.w, 0);
const pickTask = () => {
  let r = rand() * totalW;
  return TASKS.find((t) => (r -= t.w) < 0) ?? TASKS[0];
};
const providerFor = {
  llm: [{ name: "Groq", model: "llama-3.3-70b-versatile", lat: 900 }],
  stt: [{ name: "Whisper (STT)", model: "whisper-large-v3-turbo", lat: 600 }],
  tts: [{ name: "Edge TTS", model: "fr-FR-DeniseNeural", lat: 400 }],
  ocr: [{ name: "Tesseract.js", model: "fra", lat: 2800 }],
};

const calls = [];
for (let h = 7 * 24; h >= 0; h--) {
  const hourStart = new Date(now.getTime() - h * 3600000);
  const hour = hourStart.getHours();
  const n = hour >= 7 && hour <= 21 ? 2 + Math.floor(rand() * 6) : Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const t = pickTask();
    const p = providerFor[t.capability][0];
    const at = new Date(hourStart.getTime() + rand() * 3600000);
    if (at > now) continue;
    const failed = rand() < 0.015;
    const llm = t.capability === "llm";
    calls.push({
      task: t.task,
      capability: t.capability,
      provider: p.name,
      model: p.model,
      status: failed ? "erreur" : "succes",
      latencyMs: Math.round(p.lat * (0.6 + rand() * 1.2)),
      promptPreview: llm ? pickOne(PROMPTS) : undefined,
      tokens: llm ? ["[PERSONNE_1]"] : [],
      error: failed ? pickOne(["HTTP 429 : Rate limit reached", "Délai dépassé (12 s)", "HTTP 503 : Service Unavailable"]) : undefined,
      senior: marie._id,
      createdAt: at,
      updatedAt: at,
    });
    // Après une erreur LLM, la passerelle bascule vers Gemini
    if (failed && llm) {
      calls.push({
        task: t.task,
        capability: "llm",
        provider: "Gemini",
        model: "gemini-2.0-flash",
        status: "succes",
        fallback: true,
        latencyMs: Math.round(1300 * (0.7 + rand())),
        promptPreview: pickOne(PROMPTS),
        tokens: ["[PERSONNE_1]"],
        senior: marie._id,
        createdAt: new Date(at.getTime() + 1500),
        updatedAt: new Date(at.getTime() + 1500),
      });
    }
  }
}
await AiCall.collection.insertMany(calls);

/* ---------- Synthèse hebdomadaire (via la passerelle IA) ---------- */
await generateWeeklySummary(marie);

console.log(`✅ Données de démonstration créées (${intakes.length} prises, ${calls.length} appels IA)`);
console.log("");
console.log("   Administrateur : admin@senior-assistant.tn / Admin123!");
console.log("   Aidant         : sophie.martin@exemple.com / Aidant123!");
console.log("   Senior Marie   : code d'appairage MARIE7, PIN 1234");
void admin;

await mongoose.disconnect();
