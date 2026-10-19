import { badRequest, notFound, pick, requireFields } from "../../utils/httpError.js";
import { trackEvent } from "../../services/tracking.js";
import Memory from "../../models/souvenirs/Memory.js";
import { checkProposal, factsChanged, generateForMemory, proposeForMemory } from "../../services/souvenirs/generation.service.js";
import { memoryStats } from "../../services/souvenirs/stats.service.js";
import { MAX_PHOTOS, deletePhoto, detectImageType, savePhoto, streamPhoto } from "../../services/souvenirs/photo.storage.js";

// Champs modifiables par l'aidant
const FIELDS = ["title", "date", "place", "people", "story"];

// Nettoie la liste des personnes envoyée par le formulaire
function sanitize(body) {
  const data = pick(body, FIELDS);
  if (data.people !== undefined) {
    if (!Array.isArray(data.people)) throw badRequest("« people » doit être une liste");
    data.people = data.people
      .map((p) => ({ name: String(p?.name ?? "").trim(), relation: String(p?.relation ?? "").trim() || undefined }))
      .filter((p) => p.name)
      .slice(0, 10);
  }
  return data;
}

async function findMemory(req) {
  const memory = await Memory.findOne({ _id: req.params.id, senior: req.senior._id });
  if (!memory) throw notFound("Souvenir introuvable");
  return memory;
}

const track = (req, action) =>
  trackEvent({ senior: req.senior._id, user: req.user._id, actor: "aidant", module: "souvenirs", action, channel: "ecran" });

/* GET /souvenirs?status=a_valider */
export async function list(req, res) {
  const filter = { senior: req.senior._id };
  if (["valide", "a_valider"].includes(req.query.status)) filter.status = req.query.status;
  const [memories, pendingCount] = await Promise.all([
    Memory.find(filter).sort({ createdAt: -1 }),
    Memory.countDocuments({ senior: req.senior._id, status: "a_valider" }),
  ]);
  res.json({ memories, pendingCount });
}

/* GET /souvenirs/stats?days=7 */
export async function stats(req, res) {
  const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 7, 1), 90);
  res.json(await memoryStats(req.senior._id, days));
}

/* GET /souvenirs/:id */
export async function getOne(req, res) {
  res.json({ memory: await findMemory(req) });
}

/* POST /souvenirs : saisi par l'aidant → validé d'office, récit et quiz générés */
export async function create(req, res) {
  requireFields(req.body, ["title"]);
  const memory = new Memory({
    ...sanitize(req.body),
    senior: req.senior._id,
    source: "aidant",
    status: "valide",
    createdBy: req.user._id,
    validatedAt: new Date(),
  });
  await memory.validate(); // erreurs de saisie avant d'appeler l'IA
  await generateForMemory(memory, req.senior);
  await memory.save();
  track(req, "souvenir_cree");
  res.status(201).json({ memory });
}

/* PUT /souvenirs/:id : si un fait change, le récit et le quiz sont régénérés */
export async function update(req, res) {
  const memory = await findMemory(req);
  memory.set(sanitize(req.body));
  await memory.validate();
  if (memory.status === "valide" && factsChanged(memory)) await generateForMemory(memory, req.senior);
  await memory.save();
  res.json({ memory });
}

/* PATCH /souvenirs/:id/valider : souvenir raconté par le senior, relu par l'aidant */
export async function validate(req, res) {
  const memory = await findMemory(req);
  if (req.body && Object.keys(req.body).length) memory.set(sanitize(req.body)); // corrections éventuelles
  memory.status = "valide";
  memory.validatedAt = new Date();
  await memory.validate();
  await generateForMemory(memory, req.senior);
  await memory.save();
  track(req, "souvenir_valide");
  res.json({ memory });
}

/* PATCH /souvenirs/:id/visibilite  { hidden: true | false }
 * Masque ou démasque un souvenir pour le senior, sans le supprimer. */
export async function setVisibility(req, res) {
  if (typeof req.body?.hidden !== "boolean") throw badRequest("« hidden » doit valoir true ou false");
  const memory = await findMemory(req);
  if (memory.status !== "valide") throw badRequest("Validez d'abord ce souvenir avant de changer sa visibilité");
  memory.hidden = req.body.hidden;
  await memory.save();
  res.json({ memory });
}

/* POST /souvenirs/:id/regenerer
 * Demande une NOUVELLE PROPOSITION de récit et de quiz, sans rien enregistrer :
 * la version actuelle reste en base tant que l'aidant n'a pas accepté la proposition. */
export async function regenerate(req, res) {
  const memory = await findMemory(req);
  const proposal = await proposeForMemory(memory, req.senior);
  res.json({ proposal });
}

/* PUT /souvenirs/:id/recit  { recit, questions, provider, fallback }
 * L'aidant accepte la proposition : elle est vérifiée à nouveau, puis enregistrée. */
export async function acceptProposal(req, res) {
  const memory = await findMemory(req);
  let checked;
  try {
    checked = checkProposal(req.body, memory);
  } catch (err) {
    throw badRequest(`Proposition refusée : ${err.message}`);
  }
  memory.generated = {
    ...checked,
    provider: String(req.body.provider ?? "IA").slice(0, 60),
    fallback: Boolean(req.body.fallback),
    generatedAt: new Date(),
  };
  // Un seul récit : la version acceptée devient aussi le texte du formulaire de l'aidant
  memory.story = checked.recit;
  await memory.save();
  res.json({ memory });
}

/* DELETE /souvenirs/:id */
export async function remove(req, res) {
  const memory = await findMemory(req);
  // Les fichiers des photos sont supprimés avec le souvenir
  // (étape Senior : supprimer aussi l'enregistrement audio memory.audio.fileId)
  await Promise.all(memory.photos.map((p) => deletePhoto(p.fileId)));
  await memory.deleteOne();
  res.status(204).end();
}

/* ---------- Photos ---------- */

/* POST /souvenirs/:id/photos — corps de la requête : l'image brute (Content-Type image/jpeg, png ou webp) */
export async function addPhoto(req, res) {
  const memory = await findMemory(req);
  if (memory.photos.length >= MAX_PHOTOS) throw badRequest(`${MAX_PHOTOS} photos au maximum par souvenir`);
  // express.raw() a placé l'image dans req.body sous forme de Buffer
  const mime = detectImageType(req.body);
  if (!mime) throw badRequest("Format accepté : photo JPEG, PNG ou WebP");

  const fileId = await savePhoto(req.body, { mime, memoryId: memory._id });
  memory.photos.push({ fileId, mime, size: req.body.length });
  await memory.save();
  res.status(201).json({ memory });
}

/* GET /souvenirs/:id/photos/:photoId — renvoie l'image elle-même */
export async function getPhoto(req, res) {
  const memory = await findMemory(req);
  const photo = memory.photos.id(req.params.photoId);
  if (!photo) throw notFound("Photo introuvable");
  await streamPhoto(photo.fileId, res, photo.mime).catch(() => {
    throw notFound("Fichier de la photo introuvable");
  });
}

/* DELETE /souvenirs/:id/photos/:photoId */
export async function removePhoto(req, res) {
  const memory = await findMemory(req);
  const photo = memory.photos.id(req.params.photoId);
  if (!photo) throw notFound("Photo introuvable");
  await deletePhoto(photo.fileId);
  photo.deleteOne(); // retire la photo de la liste du souvenir
  await memory.save();
  res.json({ memory });
}
