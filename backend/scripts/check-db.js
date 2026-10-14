// Teste la connexion MongoDB : npm run db:check
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";

const ok = await connectDB(process.env.MONGODB_URI);

if (ok) {
  const { version } = await mongoose.connection.db.admin().serverInfo();
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`   Version du serveur : ${version}`);
  console.log(`   Base : ${mongoose.connection.name}`);
  console.log(`   Collections : ${collections.map((c) => c.name).join(", ") || "(aucune pour l'instant)"}`);
  await mongoose.disconnect();
}

process.exit(ok ? 0 : 1);
