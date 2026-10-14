import mongoose from "mongoose";

// Masque le mot de passe éventuel dans les messages affichés
const safeUri = (uri) => uri.replace(/\/\/([^:]+):[^@]+@/, "//$1:****@");

// Connexion à MongoDB avec l'adresse définie dans backend/.env (MONGODB_URI)
export async function connectDB(uri) {
  if (!uri) {
    console.error("❌ MONGODB_URI est absent de backend/.env");
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log(`✅ MongoDB connecté (${safeUri(uri)})`);
    return true;
  } catch (err) {
    console.error(`❌ Connexion MongoDB impossible (${safeUri(uri)}) : ${err.message}`);
    console.error("   → Vérifiez que le service MongoDB tourne (Windows : sc query MongoDB)");
    return false;
  }
}
