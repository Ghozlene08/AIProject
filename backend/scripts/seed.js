// Remplit la base avec des données de démonstration : npm run seed
// ⚠️ Vide d'abord toutes les collections de l'application.
//
// Les seniors, aidants et leur historique d'usage (45 jours) sont FICTIFS : ils servent à
// alimenter l'espace administrateur tant que l'interface Senior n'enregistre pas encore
// ses propres événements. Tous les indicateurs sont ensuite calculés à partir de ces données.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import {
  AiCall,
  AiProvider,
  Alert,
  Contact,
  Event,
  Intake,
  Medication,
  PlatformSettings,
  Senior,
  UsageEvent,
  User,
  WeeklySummary,
} from "../src/models/index.js";
import { ensureProviders } from "../src/services/ai/defaults.js";
import { generateWeeklySummary } from "../src/services/summary.js";
import { addDays, atTime, startOfDay } from "../src/utils/dates.js";
import { seedMemories } from "./souvenirs/seed.js";

if (!(await connectDB(process.env.MONGODB_URI))) process.exit(1);

// Générateur pseudo-aléatoire déterministe : mêmes données à chaque seed
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0);
  return pairs.find(([, w]) => (r -= w) < 0)?.[0] ?? pairs[0][0];
};
const DAY = 24 * 3600 * 1000;
const now = new Date();
const today = startOfDay(now);

console.log("🧹 Nettoyage des collections…");
await Promise.all(
  [User, Senior, Contact, Medication, Intake, Event, Alert, WeeklySummary, AiCall, AiProvider, UsageEvent, PlatformSettings].map((M) => M.deleteMany({})),
);
await ensureProviders();
await PlatformSettings.get();

/* =====================================================================
 * 1. Comptes de démonstration (connexion)
 * ===================================================================== */
const hash = (p) => bcrypt.hash(p, 10);
const aidantHash = await hash("Aidant123!");
const [, sophie, samir] = await User.create([
  { name: "Mariem Sellami", email: "admin@senior-assistant.tn", passwordHash: await hash("Admin123!"), role: "admin", lastLoginAt: now },
  { name: "Sophie Martin", email: "sophie.martin@exemple.com", passwordHash: aidantHash, role: "aidant", phone: "06 11 22 33 44", lastLoginAt: now, notifications: { email: true, telegram: true, telegramChatId: "000000000" } },
  { name: "Samir Ben Ali", email: "samir@exemple.com", passwordHash: aidantHash, role: "aidant", lastLoginAt: addDays(now, -2) },
  { name: "Leila Khelifi", email: "leila@exemple.com", passwordHash: aidantHash, role: "aidant", status: "inactif", lastLoginAt: addDays(now, -40) },
  { name: "Karim Haddad", email: "karim.admin@senior-assistant.tn", passwordHash: await hash("Admin123!"), role: "admin", lastLoginAt: addDays(now, -3) },
]);

/* =====================================================================
 * 2. Marie Dupont : le profil détaillé de la démonstration aidant
 * ===================================================================== */
const marie = await Senior.create({
  firstName: "Marie",
  lastName: "Dupont",
  birthDate: new Date(now.getFullYear() - 72, 2, 14),
  phone: "06 12 34 56 78",
  address: "12 rue de Marseille",
  city: "Tunis",
  doctor: { name: "Dr. Ben Salem", specialty: "Médecin traitant", phone: "71 234 567" },
  medicalNotes: "Hypertension légère. Allergie à la pénicilline.",
  caregivers: [sophie._id],
  pairingCode: "MARIE7",
  pinHash: await hash("1234"),
  pairedAt: addDays(now, -40),
  lastSeenAt: now,
  createdAt: addDays(now, -41),
});

await Contact.create([
  { senior: marie._id, name: "Sophie Martin", relation: "Fille", phone: "06 11 22 33 44", isEmergency: true, order: 1 },
  { senior: marie._id, name: "Thomas Martin", relation: "Fils", phone: "06 22 33 44 55", isEmergency: true, order: 2 },
  { senior: marie._id, name: "Léa Martin", relation: "Petite-fille", phone: "06 33 44 55 66", order: 3 },
  { senior: marie._id, name: "Dr. Ben Salem", relation: "Médecin traitant", phone: "71 234 567", order: 4 },
  { senior: marie._id, name: "M. Haddad", relation: "Voisin", phone: "06 44 55 66 77", order: 5 },
]);

const marieMeds = await Medication.create([
  { senior: marie._id, name: "Paracétamol", dosage: "1 g", posology: "1 comprimé", times: ["08:30"], instructions: "Pendant le petit déjeuner" },
  { senior: marie._id, name: "Aspirine", dosage: "75 mg", posology: "1 comprimé", times: ["20:00"], instructions: "Après le dîner" },
  { senior: marie._id, name: "Vitamine D", dosage: "1000 UI", posology: "1 comprimé", times: ["12:00"] },
]);

await Event.create([
  { senior: marie._id, title: "Petit déjeuner avec ma fille", type: "repas", startAt: atTime(today, "10:00"), location: "À la maison" },
  { senior: marie._id, title: "Rendez-vous médical", type: "rdv", startAt: atTime(today, "14:00"), location: "Cabinet Dr. Ben Salem — Cardiologie" },
  { senior: marie._id, title: "Consultation cardiologique", type: "rdv", startAt: atTime(addDays(today, 3), "10:30"), location: "CHU La Rabta" },
  { senior: marie._id, title: "Atelier mémoire", type: "activite", startAt: atTime(addDays(today, 5), "15:00"), location: "Club des aînés" },
  { senior: marie._id, title: "Prise de sang", type: "rdv", startAt: atTime(addDays(today, -3), "09:00"), location: "Laboratoire Pasteur", status: "fait", createdBy: "senior" },
]);

/* =====================================================================
 * 3. Population fictive : aidants et seniors
 * ===================================================================== */
const FIRST_F = ["Fatma", "Aïcha", "Monique", "Nadia", "Jeanne", "Habiba", "Salma", "Yvette", "Zohra", "Mounira", "Hélène", "Latifa", "Rachida", "Odile", "Mabrouka"];
const FIRST_M = ["Ahmed", "Mohamed", "Jean", "Hédi", "Ali", "Pierre", "Taoufik", "Moncef", "Bernard", "Habib", "Mokhtar", "Paul"];
const LAST = ["Ben Salah", "Trabelsi", "Gharbi", "Jaziri", "Bouaziz", "Durand", "Mejri", "Lefebvre", "Chaabane", "Hammami", "Karoui", "Moreau", "Ayari", "Zouari", "Rekik", "Dridi", "Masmoudi", "Bernard"];
const AIDANT_FIRST = ["Sana", "Youssef", "Imen", "Mehdi", "Claire", "Rim", "Walid", "Inès", "Hamza", "Nour", "Julien", "Amel", "Skander", "Olfa", "Malek", "Emma", "Anis", "Dorra", "Firas", "Sarra", "Lucas", "Yasmine"];
const CITIES = [["Tunis", 46], ["Sfax", 20], ["Sousse", 16], ["Ariana", 13], ["Bizerte", 5]];

const aidants = await User.insertMany(
  AIDANT_FIRST.map((first, i) => {
    const lastLogin = i % 9 === 0 ? addDays(now, -(10 + i)) : new Date(now.getTime() - rand() * 4 * DAY);
    return {
      name: `${first} ${pickOne(LAST)}`,
      email: `${first.toLowerCase()}.${i}@exemple.com`,
      passwordHash: aidantHash,
      role: "aidant",
      lastLoginAt: lastLogin,
      createdAt: addDays(now, -(15 + Math.floor(rand() * 45))),
      notifications: chance(0.7) ? { email: true, telegram: true, telegramChatId: String(100000000 + i) } : { email: true, telegram: false },
    };
  }),
);

// Profils d'usage : quotidien, régulier, occasionnel, décroché (a cessé d'utiliser l'app), jamais activé
const PROFILES = { quotidien: { days: 0.92, perDay: [4, 9] }, regulier: { days: 0.55, perDay: [2, 6] }, occasionnel: { days: 0.22, perDay: [1, 4] }, decroche: { days: 0.6, perDay: [2, 5] }, jamais: { days: 0, perDay: [0, 0] } };
const seniorsData = [];
for (let i = 0; i < 40; i++) {
  const female = chance(0.62);
  const createdAgo = i < 5 ? Math.floor(rand() * 7) : 8 + Math.floor(rand() * 50); // quelques nouveaux profils récents
  const profile = weighted([["quotidien", 38], ["regulier", 30], ["occasionnel", 16], ["decroche", 8], ["jamais", 8]]);
  const caregiverCount = chance(0.3) ? 2 : 1;
  const caregivers = Array.from({ length: caregiverCount }, () => pickOne(aidants)._id);
  seniorsData.push({
    profile,
    doc: {
      firstName: female ? pickOne(FIRST_F) : pickOne(FIRST_M),
      lastName: pickOne(LAST),
      birthDate: new Date(now.getFullYear() - (68 + Math.floor(rand() * 20)), Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)),
      city: weighted(CITIES),
      caregivers: [...new Set(caregivers.map(String))],
      pairingCode: `DEMO${String(i).padStart(2, "0")}`,
      pairedAt: profile === "jamais" ? undefined : addDays(now, -createdAgo + 1),
      createdAt: addDays(now, -createdAgo),
    },
  });
}
const seniors = await Senior.insertMany(seniorsData.map((s) => s.doc));
const population = [{ senior: marie, profile: "quotidien", caregivers: [sophie._id] }].concat(
  seniors.map((s, i) => ({ senior: s, profile: seniorsData[i].profile, caregivers: s.caregivers })),
);
await Senior.create({ firstName: "Ahmed", lastName: "Ben Ali", birthDate: new Date(now.getFullYear() - 80, 6, 2), city: "Sousse", caregivers: [samir._id], pairingCode: "AHMED8", pinHash: await hash("4321"), createdAt: addDays(now, -2) });

/* =====================================================================
 * 4. Historique d'usage sur 45 jours (événements, appels IA, prises, alertes)
 * ===================================================================== */
const HISTORY_DAYS = 45;
const INTENTS = [
  // [intention, module, action, poids, taux de réussite, cause d'échec principale]
  ["question_libre", "assistant", "interaction_vocale", 30, 0.93, "intention_non_comprise"],
  ["consulter_agenda", "agenda", "interaction_vocale", 16, 0.95, "audio_inaudible"],
  ["creer_rappel", "agenda", "rappel_cree", 12, 0.76, "horaire_non_identifie"],
  ["expliquer_document", "documents", "document_traite", 11, 0.87, "document_illisible"],
  ["raconter_souvenir", "souvenirs", "souvenir_ecoute", 12, 0.95, "intention_non_comprise"],
  ["appeler_proche", "famille", "appel_proche", 9, 0.9, "contact_inconnu"],
];
const HOURS = [[7, 4], [8, 9], [9, 10], [10, 9], [11, 7], [12, 4], [13, 3], [14, 6], [15, 7], [16, 7], [17, 6], [18, 5], [19, 5], [20, 4], [21, 2]];

const events = [];
const calls = [];
const intakes = [];
const alerts = [];
const meds = [...marieMeds];

const llmCall = (at, task, seniorId, fail) => {
  const lat = 700 + rand() * 1100;
  if (fail) {
    calls.push({ task, capability: "llm", provider: "Groq", model: "openai/gpt-oss-120b", status: "erreur", fallback: false, latencyMs: Math.round(lat * 2), error: pickOne(["HTTP 429 : Rate limit reached", "Délai dépassé (12 s)", "HTTP 503 : Service Unavailable"]), senior: seniorId, createdAt: at, updatedAt: at });
    const later = new Date(at.getTime() + 1500);
    calls.push({ task, capability: "llm", provider: "Gemini", model: "gemini-flash-latest", status: "succes", fallback: true, latencyMs: Math.round(900 + rand() * 900), tokens: ["[PERSONNE_1]"], promptPreview: "Demande de [PERSONNE_1] (anonymisée)", senior: seniorId, createdAt: later, updatedAt: later });
  } else {
    calls.push({ task, capability: "llm", provider: "Groq", model: "openai/gpt-oss-120b", status: "succes", fallback: false, latencyMs: Math.round(lat), tokens: ["[PERSONNE_1]"], promptPreview: "Demande de [PERSONNE_1] (anonymisée)", senior: seniorId, createdAt: at, updatedAt: at });
  }
};

for (const { senior, profile, caregivers } of population) {
  const p = PROFILES[profile];
  const start = Math.max(startOfDay(senior.createdAt).getTime(), today.getTime() - HISTORY_DAYS * DAY);

  // Deux traitements par senior activé (Marie a déjà les siens)
  let seniorMeds = senior._id.equals(marie._id) ? marieMeds : [];
  if (!seniorMeds.length && profile !== "jamais") {
    seniorMeds = await Medication.insertMany([
      { senior: senior._id, name: pickOne(["Metformine", "Amlodipine", "Paracétamol", "Lévothyrox"]), dosage: pickOne(["500 mg", "5 mg", "1 g", "50 µg"]), posology: "1 comprimé", times: ["08:00"] },
      { senior: senior._id, name: pickOne(["Aspirine", "Atorvastatine", "Vitamine D"]), dosage: pickOne(["75 mg", "20 mg", "1000 UI"]), posology: "1 comprimé", times: ["20:00"] },
    ]);
    meds.push(...seniorMeds);
  }

  for (let t = start; t <= today.getTime(); t += DAY) {
    const day = new Date(t);
    const ago = Math.round((today.getTime() - t) / DAY);
    const stopped = profile === "decroche" && ago < 12; // décroché depuis 12 jours
    const isActive = !stopped && chance(p.days);
    const progress = 1 - ago / HISTORY_DAYS; // amélioration progressive (voix, latence)

    // Prises de médicaments
    for (const med of seniorMeds) {
      for (const hhmm of med.times) {
        const at = atTime(day, hhmm);
        if (at > now) {
          intakes.push({ senior: senior._id, medication: med._id, scheduledAt: at, status: "a_venir", reminders: 0 });
          continue;
        }
        if (at.getTime() > now.getTime() - 30 * 60000) {
          intakes.push({ senior: senior._id, medication: med._id, scheduledAt: at, status: "a_venir", reminders: 0 });
          continue;
        }
        const confirmProb = stopped ? 0.15 : { quotidien: 0.94, regulier: 0.85, occasionnel: 0.62, decroche: 0.8, jamais: 0 }[profile] - (hhmm >= "19:00" ? 0.08 : 0);
        const ok = chance(confirmProb);
        const confirmedAt = new Date(at.getTime() + (2 + rand() * 20) * 60000);
        intakes.push({ senior: senior._id, medication: med._id, scheduledAt: at, status: ok ? "confirme" : "manque", confirmedAt: ok ? confirmedAt : undefined, reminders: ok ? 0 : 2 });
        if (ok) {
          const voice = chance(0.55 + 0.35 * progress);
          events.push({ senior: senior._id, actor: "senior", module: "agenda", action: "prise_confirmee", channel: voice ? "voix" : "ecran", outcome: "reussi", intent: voice ? "confirmer_prise" : undefined, step: voice ? 4 : undefined, latencyMs: voice ? Math.round(1600 + rand() * 1400) : undefined, createdAt: confirmedAt });
        } else {
          const created = new Date(at.getTime() + 30 * 60000);
          events.push({ senior: senior._id, actor: "systeme", module: "agenda", action: "prise_manquee", channel: "auto", outcome: "echec", createdAt: created });
          if (ago <= 30) {
            const telegram = caregivers.some((id) => aidants.find((a) => a._id.equals(id))?.notifications?.telegram) || senior._id.equals(marie._id);
            const seenInApp = ago > 1 ? chance(0.95) : chance(0.45);
            const neverDelivered = !telegram && !seenInApp;
            alerts.push({
              senior: senior._id,
              type: "prise_manquee",
              severity: "haute",
              title: "Prise manquée",
              message: `${med.name} ${med.dosage} — ${hhmm}, non confirmée après 2 rappels`,
              sentTelegram: telegram,
              deliveredAt: neverDelivered ? undefined : new Date(created.getTime() + (telegram ? 40000 : rand() * 6 * 3600000)),
              read: seenInApp,
              readAt: seenInApp ? new Date(created.getTime() + rand() * 8 * 3600000) : undefined,
              createdAt: created,
              updatedAt: created,
            });
          }
        }
      }
    }

    if (!isActive) continue;

    // Interactions de la journée
    const n = p.perDay[0] + Math.floor(rand() * (p.perDay[1] - p.perDay[0] + 1));
    for (let k = 0; k < n; k++) {
      const at = new Date(atTime(day, `${String(weighted(HOURS)).padStart(2, "0")}:00`).getTime() + rand() * 3600000);
      if (at > now) continue;
      const [intent, module, action, , successRate, mainReason] = weighted(INTENTS.map((x) => [x, x[3]]));
      const voice = chance(0.62 + 0.3 * progress); // l'adoption de la voix progresse
      const roll = rand();
      const outcome = roll < successRate ? "reussi" : roll < successRate + (1 - successRate) * 0.65 ? "echec" : "abandon";
      const step = outcome === "reussi" ? 4 : outcome === "abandon" ? 3 : weighted([[1, 2], [2, 6], [3, 2]]);
      const failureReason = outcome === "reussi" ? undefined : step === 1 ? "audio_inaudible" : outcome === "abandon" ? undefined : chance(0.75) ? mainReason : "intention_non_comprise";
      const slow = chance(0.035);
      const latencyMs = voice ? Math.round(slow ? 4100 + rand() * 2400 : (1800 - 300 * progress) + rand() * 1600) : undefined;

      events.push({
        senior: senior._id,
        actor: "senior",
        module,
        action,
        channel: voice ? "voix" : "ecran",
        outcome,
        intent: voice ? intent : undefined,
        step: voice ? step : undefined,
        failureReason: voice ? failureReason : outcome === "reussi" ? undefined : failureReason,
        latencyMs,
        createdAt: at,
      });

      // Appels IA correspondants (30 derniers jours)
      if (ago <= 30) {
        if (voice) {
          calls.push({ task: "Reconnaissance vocale", capability: "stt", provider: "Whisper (STT)", model: "whisper-large-v3-turbo", status: chance(0.006) ? "erreur" : "succes", latencyMs: Math.round(450 + rand() * 600), senior: senior._id, createdAt: at, updatedAt: at });
          if (step >= 2) llmCall(new Date(at.getTime() + 600), module === "documents" ? "Simplification de document" : module === "souvenirs" ? "Souvenir" : "Dialogue", senior._id, chance(0.016));
          if (step >= 2) calls.push({ task: "Synthèse vocale", capability: "tts", provider: "Edge TTS", model: "fr-FR-DeniseNeural", status: chance(0.004) ? "erreur" : "succes", latencyMs: Math.round(300 + rand() * 500), senior: senior._id, createdAt: new Date(at.getTime() + 2000), updatedAt: new Date(at.getTime() + 2000) });
        }
        if (module === "documents") {
          calls.push({ task: "OCR", capability: "ocr", provider: "Tesseract.js", model: "fra", status: outcome === "echec" && failureReason === "document_illisible" ? "erreur" : "succes", latencyMs: Math.round(2200 + rand() * 1800), error: failureReason === "document_illisible" ? "Texte illisible (confiance < 40 %)" : undefined, senior: senior._id, createdAt: at, updatedAt: at });
          if (!voice) llmCall(new Date(at.getTime() + 3000), "Simplification de document", senior._id, chance(0.016));
        }
      }
    }

    // SOS (rare)
    if (chance(0.004)) {
      const at = atTime(day, "16:20");
      if (at < now) {
        events.push({ senior: senior._id, actor: "senior", module: "famille", action: "sos", channel: "voix", outcome: "reussi", intent: "sos", step: 4, latencyMs: 1400, createdAt: at });
        alerts.push({ senior: senior._id, type: "sos", severity: "haute", title: "SOS déclenché", message: "Le senior a demandé de l'aide à voix haute.", sentTelegram: true, deliveredAt: new Date(at.getTime() + 30000), read: true, readAt: new Date(at.getTime() + 4 * 60000), createdAt: at, updatedAt: at });
      }
    }
  }
}

// Activité des aidants (connexions, synthèses consultées)
for (const aidant of [sophie, ...aidants]) {
  for (let d = 0; d < HISTORY_DAYS; d++) {
    const day = addDays(today, -d);
    if (aidant.lastLoginAt && day > aidant.lastLoginAt) continue;
    if (chance(0.55)) events.push({ user: aidant._id, actor: "aidant", module: "aidant", action: "connexion", channel: "ecran", outcome: "reussi", createdAt: atTime(day, `${String(8 + Math.floor(rand() * 12)).padStart(2, "0")}:15`) });
    if (day.getDay() === 1 && chance(0.7)) events.push({ user: aidant._id, actor: "aidant", module: "aidant", action: "synthese_consultee", channel: "ecran", outcome: "reussi", createdAt: atTime(day, "19:30") });
  }
}

// Synthèses hebdomadaires (une par semaine et par senior activé)
const summaries = [];
for (const { senior, profile } of population) {
  if (profile === "jamais" || senior._id.equals(marie._id)) continue;
  for (let w = 1; w <= 5; w++) {
    const end = addDays(today, -7 * (w - 1) - 1);
    if (end < senior.createdAt) break;
    const adherence = Math.round(70 + rand() * 28);
    summaries.push({ senior: senior._id, periodStart: addDays(end, -6), periodEnd: end, content: `Semaine globalement stable pour ${senior.firstName}. Observance de ${adherence} % sur les prises de médicaments.\nSuggestion : un appel au moment des prises du soir peut aider à les ancrer dans la routine.`, stats: { intakesTotal: 14, intakesConfirmed: Math.round(14 * adherence / 100), intakesMissed: 14 - Math.round(14 * adherence / 100), adherence, events: 2, alerts: 1 }, provider: "Groq", createdAt: atTime(addDays(end, 1), "07:00") });
  }
}

const rdvAlert = { senior: marie._id, type: "rdv", severity: "moyenne", title: "Rappel rendez-vous", message: "Consultation cardiologique — dans 3 jours, 10:30", deliveredAt: atTime(today, "08:21"), read: false, createdAt: atTime(today, "08:20"), updatedAt: atTime(today, "08:20") };
const symptom = { senior: marie._id, type: "symptome", severity: "moyenne", title: "Symptôme inhabituel", message: "Marie a mentionné des vertiges à l'assistant vocal mardi matin.", deliveredAt: addDays(now, -3), read: true, readAt: addDays(now, -3), createdAt: addDays(now, -3), updatedAt: addDays(now, -3) };

await Intake.insertMany(intakes);
await UsageEvent.collection.insertMany(events);
await AiCall.collection.insertMany(calls);
await Alert.collection.insertMany([...alerts, rdvAlert, symptom]);
await WeeklySummary.collection.insertMany(summaries);

// Module Souvenirs : souvenirs, écoutes et quiz de démonstration pour Marie
await seedMemories({ senior: marie, caregiver: sophie });

// Synthèse de Marie via la vraie passerelle IA (anonymisation + secours)
await generateWeeklySummary(marie);

console.log(`✅ Données de démonstration créées :`);
console.log(`   ${population.length + 1} seniors, ${aidants.length + 3} aidants, 2 administrateurs, ${events.length} événements d'usage, ${calls.length} appels IA, ${intakes.length} prises, ${alerts.length + 2} alertes`);
console.log("");
console.log("   Administrateur : admin@senior-assistant.tn / Admin123!");
console.log("   Aidant         : sophie.martin@exemple.com / Aidant123!");
console.log("   Senior Marie   : code d'appairage MARIE7, PIN 1234");
void meds;

await mongoose.disconnect();
