import bcrypt from "bcryptjs";
import { AiCall, AiProvider, Senior, User } from "../models/index.js";
import { addDays, startOfDay } from "../utils/dates.js";
import { badRequest, notFound, pick, requireFields } from "../utils/httpError.js";
import { hasApiKey } from "../services/ai/providers.js";
import { generateText } from "../services/ai/gateway.js";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------- Supervision ---------- */

export async function overview(_req, res) {
  const since = startOfDay();
  const last24h = new Date(Date.now() - 24 * 3600 * 1000);

  const [providers, perProvider, totals, hourly, recent, users, seniors] = await Promise.all([
    AiProvider.find().sort({ capability: 1, priority: 1 }),
    AiCall.aggregate([
      { $match: { createdAt: { $gte: addDays(since, -6) } } },
      {
        $group: {
          _id: "$provider",
          calls: { $sum: 1 },
          success: { $sum: { $cond: [{ $eq: ["$status", "succes"] }, 1, 0] } },
          latency: { $avg: "$latencyMs" },
        },
      },
    ]),
    AiCall.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          calls: { $sum: 1 },
          errors: { $sum: { $cond: [{ $eq: ["$status", "erreur"] }, 1, 0] } },
          fallbacks: { $sum: { $cond: ["$fallback", 1, 0] } },
          latency: { $avg: "$latencyMs" },
        },
      },
    ]),
    AiCall.aggregate([
      { $match: { createdAt: { $gte: last24h } } },
      {
        $group: {
          _id: { $dateTrunc: { date: "$createdAt", unit: "hour" } },
          calls: { $sum: 1 },
          errors: { $sum: { $cond: [{ $eq: ["$status", "erreur"] }, 1, 0] } },
          latency: { $avg: "$latencyMs" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AiCall.find().sort({ createdAt: -1 }).limit(6),
    User.countDocuments(),
    Senior.countDocuments(),
  ]);

  const t = totals[0] ?? { calls: 0, errors: 0, fallbacks: 0, latency: 0 };
  const byName = Object.fromEntries(perProvider.map((p) => [p._id, p]));
  res.json({
    providers: providers.map((p) => {
      const s = byName[p.name];
      return {
        ...p.toObject(),
        configured: hasApiKey(p),
        operational: p.enabled && !p.simulateFailure && hasApiKey(p),
        calls: s?.calls ?? 0,
        successRate: s ? Math.round((s.success / s.calls) * 1000) / 10 : null,
        latencyMs: s ? Math.round(s.latency) : null,
      };
    }),
    today: {
      calls: t.calls,
      errorRate: t.calls ? Math.round((t.errors / t.calls) * 1000) / 10 : 0,
      successRate: t.calls ? Math.round(((t.calls - t.errors) / t.calls) * 1000) / 10 : 100,
      fallbacks: t.fallbacks,
      latencyMs: Math.round(t.latency || 0),
    },
    hourly: hourly.map((h) => ({ hour: h._id, calls: h.calls, errors: h.errors, latencyMs: Math.round(h.latency) })),
    recent,
    counts: { users, seniors },
  });
}

export async function listAiCalls(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.provider) filter.provider = req.query.provider;
  if (req.query.days) filter.createdAt = { $gte: addDays(new Date(), -Number(req.query.days)) };
  if (req.query.q) {
    const re = new RegExp(escapeRe(String(req.query.q)), "i");
    filter.$or = [{ task: re }, { promptPreview: re }, { error: re }];
  }

  const [calls, total, providers] = await Promise.all([
    AiCall.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AiCall.countDocuments(filter),
    AiCall.distinct("provider"),
  ]);
  res.json({ calls, total, page, pages: Math.max(1, Math.ceil(total / limit)), providers });
}

/* ---------- Fournisseurs IA ---------- */

export async function listProviders(_req, res) {
  const providers = await AiProvider.find().sort({ capability: 1, priority: 1 });
  res.json({ providers: providers.map((p) => ({ ...p.toObject(), configured: hasApiKey(p) })) });
}

export async function updateProvider(req, res) {
  const provider = await AiProvider.findById(req.params.id).catch(() => null);
  if (!provider) throw notFound("Fournisseur introuvable");
  Object.assign(provider, pick(req.body, ["enabled", "priority", "role", "model", "simulateFailure"]));
  await provider.save();
  res.json({ provider: { ...provider.toObject(), configured: hasApiKey(provider) } });
}

// Teste la chaîne complète (anonymisation, secours, validation) avec une phrase type
export async function testGateway(req, res) {
  const sentence =
    req.body?.text ||
    "Bonjour, je suis Marie Dupont. Rappelle-moi d'appeler le Dr Ben Salem au 71 234 567 demain matin.";
  const started = Date.now();
  const result = await generateText({
    task: "Test de la passerelle",
    system: "Tu es un assistant vocal bienveillant pour une personne âgée. Réponds en une ou deux phrases simples.",
    prompt: sentence,
    names: ["Marie Dupont", "Marie", "Dupont", "Ben Salem"],
    localFallback: () => "D'accord, je vous rappellerai demain matin d'appeler votre médecin.",
  });
  const log = await AiCall.findOne().sort({ createdAt: -1 });
  res.json({ ...result, totalMs: Date.now() - started, log });
}

/* ---------- Utilisateurs ---------- */

export async function listUsers(req, res) {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.q) {
    const re = new RegExp(escapeRe(String(req.query.q)), "i");
    filter.$or = [{ name: re }, { email: re }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 });
  const seniorCounts = await Senior.aggregate([{ $unwind: "$caregivers" }, { $group: { _id: "$caregivers", n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(seniorCounts.map((c) => [c._id.toString(), c.n]));
  res.json({ users: users.map((u) => ({ ...u.toJSON(), seniors: counts[u._id.toString()] ?? 0 })) });
}

export async function createUser(req, res) {
  requireFields(req.body, ["name", "email", "password"]);
  if (String(req.body.password).length < 8) throw badRequest("Mot de passe : 8 caractères minimum");
  const user = await User.create({
    ...pick(req.body, ["name", "email", "phone", "role", "status"]),
    passwordHash: await bcrypt.hash(req.body.password, 10),
  });
  res.status(201).json({ user });
}

export async function updateUser(req, res) {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) throw notFound("Utilisateur introuvable");
  if (user._id.equals(req.user._id) && (req.body.role === "aidant" || req.body.status === "inactif")) {
    throw badRequest("Vous ne pouvez pas retirer vos propres droits d'administrateur");
  }
  Object.assign(user, pick(req.body, ["name", "phone", "role", "status"]));
  if (req.body.password) user.passwordHash = await bcrypt.hash(req.body.password, 10);
  await user.save();
  res.json({ user });
}

export async function deleteUser(req, res) {
  if (req.params.id === req.user._id.toString()) throw badRequest("Vous ne pouvez pas supprimer votre propre compte");
  const user = await User.findByIdAndDelete(req.params.id).catch(() => null);
  if (!user) throw notFound("Utilisateur introuvable");
  await Senior.updateMany({}, { $pull: { caregivers: user._id } });
  res.status(204).end();
}
