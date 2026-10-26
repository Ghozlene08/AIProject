import { Alert } from "../models/index.js";
import Senior from "../models/Senior.js";
import CheckIn from "../models/CheckIn.js";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RESPONSE_GRACE_MS = Number(process.env.CHECKIN_GRACE_MINUTES || 5) * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;

let timer = null;
let running = false;

/**
 * One-time cleanup: old missed check-in alerts were saved as "prise_manquee".
 * Moves them to "checkin_manque". Safe to run on every startup (idempotent).
 */
export async function migrateLegacyCheckinAlerts() {
  try {
    const res = await Alert.updateMany(
      {
        type: "appel_manque",
        $or: [{ title: /check-?in/i }, { message: /check-?in/i }],
      },
      { $set: { type: "checkin_manque" } },
    );
    if (res.modifiedCount > 0) {
      console.log(`🔧 Migrated ${res.modifiedCount} legacy check-in alert(s) to "checkin_manque".`);
    }
  } catch (err) {
    console.error("Legacy check-in alert migration failed:", err);
  }
}

export async function processCheckIns(io) {
  if (running) return;
  running = true;

  try {
    const now = new Date();

    // 1. Escalate unanswered requests whose deadline has passed.
    const overdue = await CheckIn.find({
      status: "pending",
      deadlineAt: { $lte: now },
    }).limit(100);

    for (const checkIn of overdue) {
      // Atomic claim prevents repeated escalation by overlapping runs.
      const claimed = await CheckIn.findOneAndUpdate(
        { _id: checkIn._id, status: "pending", deadlineAt: { $lte: now } },
        { $set: { status: "escalated", escalationSentAt: now } },
        { new: true },
      );
      if (!claimed) continue;

      const senior = await Senior.findById(claimed.senior);
      if (!senior) {
        console.warn(`Check-in ${claimed._id}: senior no longer exists.`);
        continue;
      }

      const seniorName = `${senior.firstName || ""} ${senior.lastName || ""}`.trim() || "Le senior";

      const alert = await Alert.create({
        senior: senior._id,
        type: "checkin_manque", // dedicated type, NEVER "prise_manquee"
        severity: "haute",
        title: "Check-in sans réponse",
        message: `${seniorName} n'a pas répondu au check-in dans le délai prévu. Veuillez vérifier sa situation.`,
        read: false,
      });

      const event = {
        alertId: alert._id.toString(),
        seniorId: senior._id.toString(),
        seniorName,
        type: alert.type, // "checkin_manque"
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt,
        checkInId: claimed._id.toString(),
      };

      if (io) {
        for (const caregiverId of senior.caregivers || []) {
          const room = `user:${caregiverId.toString()}`;
          if (io.sockets.adapter.rooms.has(room)) {
            io.to(room).emit("sos:alert", event);
          }
        }
      }

      console.log(`⚠️ Missed check-in escalated for senior ${senior._id}`);
    }

    // 2. Request a new check-in for seniors who are due.
    // Tip: to skip seniors who haven't paired a device yet, use
    //   Senior.find({ pairedAt: { $ne: null } })
    const seniors = await Senior.find({}).select("_id firstName lastName caregivers");

    for (const senior of seniors) {
      const latest = await CheckIn.findOne({ senior: senior._id }).sort({ requestedAt: -1 });

      if (latest && latest.status === "pending") continue;
      if (latest && now.getTime() - latest.requestedAt.getTime() < CHECK_INTERVAL_MS) continue;

      const checkIn = await CheckIn.create({
        senior: senior._id,
        requestedAt: now,
        deadlineAt: new Date(now.getTime() + RESPONSE_GRACE_MS),
        status: "pending",
      });

      if (io) {
        io.to(`senior:${senior._id.toString()}`).emit("senior:check-in-request", {
          checkInId: checkIn._id.toString(),
          seniorId: senior._id.toString(),
          title: "Êtes-vous en sécurité ?",
          message: "Veuillez confirmer que vous allez bien.",
          requestedAt: checkIn.requestedAt,
          deadlineAt: checkIn.deadlineAt,
        });
      }

      console.log(`📨 Check-in created for senior ${senior._id}`);
    }
  } catch (error) {
    console.error("Check-in scheduler error:", error);
  } finally {
    running = false;
  }
}

export async function startCheckInScheduler(io) {
  if (timer) return;

  console.log("⏰ Check-in scheduler started.");

  await migrateLegacyCheckinAlerts(); // fixes the old rows once, at startup

  processCheckIns(io).catch(console.error);
  timer = setInterval(() => {
    processCheckIns(io).catch(console.error);
  }, POLL_INTERVAL_MS);
}