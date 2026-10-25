import Call from "../models/Call.js";
import Senior from "../models/Senior.js";

const POPULATE = [
  { path: "caregiver", select: "name" },
  { path: "senior", select: "firstName lastName photoUrl" },
];

// GET /aidant/seniors/:seniorId/calls?limit=50&status=completed
export async function listSeniorCalls(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const filter = { senior: req.senior._id };
  if (req.query.status) filter.status = req.query.status;

  const calls = await Call.find(filter).sort({ startedAt: -1 }).limit(limit).populate(POPULATE);
  res.json({ calls });
}

// GET /aidant/calls : calls of all the seniors of the logged-in caregiver
export async function listMyCalls(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const seniors = await Senior.find({ caregivers: req.user._id }).select("_id");

  const calls = await Call.find({ senior: { $in: seniors.map((s) => s._id) } })
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate(POPULATE);

  res.json({ calls });
}