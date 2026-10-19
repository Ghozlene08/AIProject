import Alert from "../../src/models/Alert.js";
import UsageEvent from "../../src/models/UsageEvent.js";
import { addDays, atTime, startOfDay } from "../../src/utils/dates.js";
import Memory from "../../src/models/souvenirs/Memory.js";
import QuizSession from "../../src/models/souvenirs/QuizSession.js";
import { localGenerate } from "../../src/services/souvenirs/localGenerator.js";
import { dropAllPhotos } from "../../src/services/souvenirs/photo.storage.js";

/**
 * Données de démonstration du module Souvenirs pour un senior (appelé par backend/scripts/seed.js).
 * Le contenu est produit par le générateur local (aucun appel IA pendant le seed) :
 * le bouton « Régénérer avec l'IA » de l'espace aidant permet ensuite d'obtenir la version IA.
 */
const DEMO = [
  {
    title: "Mariage de Marie et Ahmed",
    date: "été 1972",
    place: "Sousse",
    people: [
      { name: "Ahmed", relation: "mari" },
      { name: "Leïla", relation: "sœur" },
    ],
    story: "Fête dans le jardin de la maison familiale. Leïla a chanté toute la soirée, et Marie portait une robe brodée par sa mère.",
  },
  {
    title: "Naissance de Karim",
    date: "1975",
    place: "Tunis",
    people: [{ name: "Karim", relation: "fils" }, { name: "Ahmed", relation: "mari" }],
    story: "Karim est né un matin de printemps à la clinique de Tunis. Ahmed avait acheté un énorme bouquet de jasmin.",
  },
  {
    title: "Vacances à Tabarka",
    date: "années 80",
    place: "Tabarka",
    people: [{ name: "Karim", relation: "fils" }, { name: "Sophie", relation: "petite-fille" }],
    story: "Chaque été, toute la famille partait une semaine à Tabarka. On pique-niquait près des rochers et on mangeait des glaces au port.",
  },
];

export async function seedMemories({ senior, caregiver }) {
  await Promise.all([Memory.deleteMany({}), QuizSession.deleteMany({}), dropAllPhotos()]);
  const now = new Date();
  const today = startOfDay(now);

  const memories = await Memory.create(
    DEMO.map((m, i) => ({
      ...m,
      senior: senior._id,
      source: "aidant",
      status: "valide",
      createdBy: caregiver._id,
      validatedAt: addDays(now, -20 + i),
      createdAt: addDays(now, -20 + i),
      // Un seul récit : le récit lu au senior est le texte saisi par l'aidant
      generated: { ...localGenerate(m), recit: m.story, provider: "Générateur local", fallback: true, generatedAt: addDays(now, -20 + i) },
    })),
  );

  // Un souvenir raconté par le senior, en attente de validation par l'aidant
  const told = {
    title: "Le marché de Sousse",
    date: "années 60",
    place: "Sousse",
    people: [{ name: "Habiba", relation: "mère" }],
    story: "Le vendredi, j'allais au marché avec ma mère Habiba. Elle achetait des épices et me donnait toujours une datte.",
  };
  await Memory.create({
    ...told,
    senior: senior._id,
    source: "senior",
    status: "a_valider",
    transcription:
      "Alors… quand j'étais petite, le vendredi, j'allais au marché de Sousse avec ma mère, Habiba. Elle achetait des épices, du cumin surtout, et elle me donnait toujours une datte. J'ai fini.",
    createdAt: atTime(addDays(today, -1), "10:42"),
  });
  await Alert.create({
    senior: senior._id,
    type: "souvenir_enregistre",
    severity: "info",
    title: "Nouveau souvenir enregistré",
    message: `${senior.firstName} a raconté un souvenir : « ${told.title} ». Écoutez-le et validez-le.`,
    deliveredAt: atTime(addDays(today, -1), "10:43"),
    createdAt: atTime(addDays(today, -1), "10:43"),
  });

  // Historique d'écoute et de quiz sur 14 jours (pour les statistiques du tableau de bord)
  const events = [];
  const sessions = [];
  const RESULTS = ["sans_indice", "sans_indice", "un_indice", "sans_indice", "deux_indices", "donnee", "sans_indice", "un_indice"];
  let r = 0;
  for (let d = 13; d >= 0; d--) {
    if (d % 3 === 2) continue; // quelques jours sans activité
    const day = addDays(today, -d);
    const memory = memories[d % memories.length];
    const at = atTime(day, d % 2 ? "10:30" : "16:15");
    events.push({ senior: senior._id, actor: "senior", module: "souvenirs", action: "souvenir_ecoute", channel: "voix", outcome: "reussi", createdAt: at });
    if (d % 2 === 0) {
      sessions.push({
        senior: senior._id,
        memory: memory._id,
        answers: [0, 1, 2].map((q) => {
          const result = RESULTS[r++ % RESULTS.length];
          const hintsUsed = { sans_indice: 0, un_indice: 1, deux_indices: 2, donnee: 2 }[result];
          return { questionIndex: q, given: "", hintsUsed, result };
        }),
        createdAt: at,
        finishedAt: at,
      });
    }
  }
  await UsageEvent.collection.insertMany(events);
  await QuizSession.insertMany(sessions);

  console.log(`   Souvenirs : ${memories.length + 1} souvenirs, ${events.length} écoutes, ${sessions.length} quiz`);
}
