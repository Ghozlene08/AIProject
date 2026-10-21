import Tesseract from "tesseract.js";
import { generateText } from "../services/ai/gateway.js";
const { recognize } = Tesseract;

/**
 * Reçoit une photo de document et extrait son texte avec Tesseract.js.
 */
export async function extractDocumentText(req, res, next) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        message: "Aucun document reçu.",
      });
    }

    console.log("📄 Document reçu :", req.file.originalname);
    console.log("📦 Taille :", req.file.size, "octets");

    const result = await recognize(
      req.file.buffer,
      "fra+ara",
      {
        logger: (info) => {
          if (info.status === "recognizing text") {
            console.log(
              `🔎 OCR : ${Math.round((info.progress || 0) * 100)} %`
            );
          }
        },
      }
    );

    const text = result.data.text.trim();

    console.log("✅ OCR terminé");
    console.log("📝 Texte extrait :", text);

    if (!text) {
      return res.status(422).json({
        message: "Aucun texte n'a pu être détecté dans le document.",
      });
    }

    return res.json({
      success: true,
      text,
    });
  } catch (error) {
    console.error("❌ Erreur OCR :", error);
    next(error);
  }
}
export async function explainDocument(req, res, next) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        message: "Aucun document reçu.",
      });
    }

    console.log("📄 Document reçu pour explication :", req.file.originalname);

    // 1. Extraction du texte avec Tesseract
    const result = await recognize(
      req.file.buffer,
      "fra+ara",
      {
        logger: (info) => {
          if (info.status === "recognizing text") {
            console.log(
              `🔎 OCR : ${Math.round((info.progress || 0) * 100)} %`
            );
          }
        },
      }
    );

    const extractedText = result.data.text.trim();

    if (!extractedText) {
      return res.status(422).json({
        message: "Aucun texte n'a pu être détecté dans le document.",
      });
    }

    console.log("📝 Texte OCR :", extractedText);

    // 2. Instructions données à l'IA
    const system = `
Tu es un assistant destiné à aider une personne âgée à comprendre ses documents.

Explique le document avec des mots simples et des phrases courtes.

Règles importantes :
- Utilise uniquement les informations présentes dans le texte fourni.
- N'invente aucune information.
- Si une information semble illisible, incomplète ou incertaine, indique-le clairement.
- Ne devine jamais un nom, une date, un montant ou une information médicale.
- Si le document est médical, explique son contenu sans donner de diagnostic ni de conseil médical.
- Mets en évidence les informations importantes : dates, rendez-vous, montants, actions à effectuer.
- Si le texte est en français, réponds en français.
- Si le texte est en arabe, réponds en arabe.
- Si le document contient les deux langues, utilise principalement la langue dominante.
`;

    const prompt = `
Voici le texte extrait du document :

--- DÉBUT DU DOCUMENT ---

${extractedText}

--- FIN DU DOCUMENT ---

Explique simplement ce document à la personne âgée.
`;

    // 3. Explication avec la passerelle IA existante
    const aiResult = await generateText({
      task: "document_simplification",
      system,
      prompt,
      names: [],
      localFallback: () =>
        "Je n'ai pas pu expliquer ce document automatiquement. Le texte du document a toutefois été extrait.",
      maxTokens: 700,
    });

    console.log("🤖 Explication générée avec :", aiResult.provider);

    // 4. Réponse envoyée au frontend
    return res.json({
      success: true,
      extractedText,
      explanation: aiResult.text,
      provider: aiResult.provider,
      fallback: aiResult.fallback,
    });
  } catch (error) {
    console.error("❌ Erreur pendant l'explication du document :", error);
    next(error);
  }
}