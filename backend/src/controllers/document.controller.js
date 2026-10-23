import Tesseract from "tesseract.js";
import sharp from "sharp";
import { PDFParse } from "pdf-parse";
import { generateText } from "../services/ai/gateway.js";
const { recognize } = Tesseract;
function isOcrTextReadable(text) {
  if (!text) return false;

  // On enlève les espaces et retours à la ligne
  const compactText = text.replace(/\s/g, "");

  // Pas assez de contenu
  if (compactText.length < 20) {
    return false;
  }

  // On compte les vraies lettres et les chiffres,
  // en français comme en arabe.
 const usefulCharacters =
  compactText.match(/[\p{L}\p{N}]/gu) || [];

  const usefulRatio =
    usefulCharacters.length / compactText.length;

  // Si le texte contient surtout des symboles comme | / etc.
  if (usefulRatio < 0.6) {
    return false;
  }

  return true;
}
function detectOcrLanguage(text) {
  if (!text) return "unknown";

  const arabicCharacters =
    text.match(/[\u0600-\u06FF]/g) || [];

  const latinCharacters =
    text.match(/[A-Za-zÀ-ÿ]/g) || [];

  if (
    arabicCharacters.length === 0 &&
    latinCharacters.length === 0
  ) {
    return "unknown";
  }

  return arabicCharacters.length > latinCharacters.length
    ? "ara"
    : "fra";
}
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
const isPdf = req.file.mimetype === "application/pdf";

console.log(
  isPdf
    ? "📕 Type de document : PDF"
    : "🖼️ Type de document : image"
);
if (isPdf) {
  const parser = new PDFParse({
    data: req.file.buffer,
  });

  const pdfResult = await parser.getText();

  await parser.destroy();

  const pdfText = pdfResult.text.trim();

  console.log("📕 Texte extrait du PDF :");
  console.log(pdfText);

  if (!pdfText) {
    return res.status(422).json({
      message:
        "Aucun texte n'a pu être extrait de ce document PDF.",
    });
  }

  const system = `
Tu es un assistant destiné à aider une personne âgée à comprendre un document.

Le texte fourni provient directement d'un document PDF.

RÈGLE PRINCIPALE :
Le texte du document est ta seule source d'information.
Tu dois reformuler uniquement les informations présentes dans le document.
Tu ne dois jamais inventer, compléter ou deviner une information.

Règles :
- Utilise des mots simples.
- Utilise des phrases courtes.
- N'invente aucune information.
- Ne modifie pas les noms, dates, heures, nombres, montants ou dosages.
- Ne donne aucune recommandation qui n'est pas présente dans le document.

Pour les documents médicaux :
- Ne donne aucun diagnostic.
- Ne donne aucun conseil médical.
- Ne modifie jamais le nom d'un médicament.
- Ne modifie jamais un dosage.
- Ne modifie jamais une fréquence de prise.

LANGUE DE LA RÉPONSE :

Si le document est en français :
- Réponds entièrement en français.

Si le document est en arabe :
- Réponds entièrement en arabe.

N'utilise pas de Markdown.
N'utilise pas d'astérisques.
`;

  const prompt = `
Voici le texte extrait du document PDF :

--- DÉBUT DU DOCUMENT ---

${pdfText}

--- FIN DU DOCUMENT ---

Explique ce document avec des mots simples et des phrases courtes pour une personne âgée.

Conserve exactement les informations importantes présentes dans le document.
`;

  const aiResult = await generateText({
    task: "document_simplification",
    system,
    prompt,
    names: [],
    localFallback: () =>
      "Je n'ai pas pu expliquer ce document automatiquement.",
    maxTokens: 700,
  });

  console.log(
    "🤖 Explication du PDF générée avec :",
    aiResult.provider
  );

  return res.json({
    success: true,
    extractedText: pdfText,
    explanation: aiResult.text,
    provider: aiResult.provider,
    fallback: aiResult.fallback,
  });
}
    // 1. Extraction du texte avec Tesseract
    // Amélioration de l'image avant l'OCR
const image = sharp(req.file.buffer);
const metadata = await image.metadata();

const targetWidth = Math.max(
  metadata.width ? metadata.width * 2 : 2000,
  2000
);

// Version 1 : traitement léger
const processedImageLight = await sharp(req.file.buffer)
  .resize({
    width: targetWidth,
    withoutEnlargement: false,
  })
  .grayscale()
  .normalize()
  .sharpen()
  .toBuffer();

// Version 2 : contraste plus fort pour les petits caractères
const processedImageContrast = await sharp(req.file.buffer)
  .resize({
    width: targetWidth,
    withoutEnlargement: false,
  })
  .grayscale()
  .normalize()
  .linear(1.4, -25)
  .sharpen()
  .toBuffer();
// Version 3 : agrandissement plus important pour les petits caractères
const processedImageSmallText = await sharp(req.file.buffer)
  .resize({
    width: 3840,
    withoutEnlargement: false,
  })
  .grayscale()
  .normalize()
  .sharpen()
  .toBuffer();
console.log(
  "🖼️ Deux versions préparées pour OCR - largeur :",
  targetWidth
);

console.log(
  "🖼️ Image améliorée avant OCR - largeur :",
  targetWidth
);

console.log("🖼️ Image améliorée avant OCR");
// OCR sur la version légèrement améliorée
const resultLight = await recognize(
  processedImageLight,
  "fra",
  {
    logger: (info) => {
      if (info.status === "recognizing text") {
        console.log(
          `🔎 OCR léger : ${Math.round((info.progress || 0) * 100)} %`
        );
      }
    },
  }
);

// OCR sur la version avec plus de contraste
const resultContrast = await recognize(
  processedImageContrast,
  "fra",
  {
    logger: (info) => {
      if (info.status === "recognizing text") {
        console.log(
          `🔎 OCR contraste : ${Math.round((info.progress || 0) * 100)} %`
        );
      }
    },
  }
);
const resultSmallText = await recognize(
  processedImageSmallText,
  "fra",
  {
    logger: (info) => {
      if (info.status === "recognizing text") {
        console.log(
          `🔎 OCR petits caractères : ${Math.round(
            (info.progress || 0) * 100
          )} %`
        );
      }
    },
  }
);
// OCR arabe
const resultArabic = await recognize(
  processedImageLight,
  "ara",
  {
    logger: (info) => {
      if (info.status === "recognizing text") {
        console.log(
          `🔎 OCR arabe : ${Math.round((info.progress || 0) * 100)} %`
        );
      }
    },
  }
);

const arabicText = resultArabic.data.text.trim();
const arabicConfidence = resultArabic.data.confidence;

const detectedArabicLanguage = detectOcrLanguage(arabicText);

console.log(
  "🌍 Langue détectée dans l'OCR arabe :",
  detectedArabicLanguage
);

console.log(
  "📊 Confiance OCR arabe :",
  arabicConfidence,
  "%"
);

console.log(
  "📝 TEXTE OCR ARABE :\n",
  arabicText
);
console.log(
  "📊 Confiance OCR petits caractères :",
  resultSmallText.data.confidence,
  "%"
);

console.log("📝 TEXTE OCR PETITS CARACTÈRES :");
console.log(resultSmallText.data.text);
console.log(
  "📊 Confiance OCR léger :",
  resultLight.data.confidence,
  "%"
);

console.log(
  "📊 Confiance OCR contraste :",
  resultContrast.data.confidence,
  "%"
);
console.log("📝 TEXTE OCR LÉGER :");
console.log(resultLight.data.text);

console.log("📝 TEXTE OCR CONTRASTE :");
console.log(resultContrast.data.text);

// On garde automatiquement le résultat avec la meilleure confiance
const bestResult =
  resultContrast.data.confidence > resultLight.data.confidence
    ? resultContrast
    : resultLight;

const frenchText = `
--- OCR VERSION LÉGÈRE ---
${resultLight.data.text.trim()}

--- OCR VERSION CONTRASTE ---
${resultContrast.data.text.trim()}
`;

const frenchDetectionText =
  resultLight.data.confidence >= resultContrast.data.confidence
    ? resultLight.data.text
    : resultContrast.data.text;

const frenchCharacters =
  frenchDetectionText.match(/[A-Za-zÀ-ÿ]/g) || [];

const arabicCharacters =
  arabicText.match(/[\u0600-\u06FF]/g) || [];

console.log(
  "🔤 Caractères français détectés :",
  frenchCharacters.length
);

console.log(
  "🔤 Caractères arabes détectés :",
  arabicCharacters.length
);

const detectedLanguage =
  arabicCharacters.length > frenchCharacters.length
    ? "ara"
    : "fra";

const extractedText =
  detectedLanguage === "ara"
    ? arabicText
    : frenchText;

console.log(
  "🌍 Langue du document retenue :",
  detectedLanguage
);

console.log(
  detectedLanguage === "ara"
    ? "🇸🇦 Utilisation de l'OCR arabe"
    : "🇫🇷 Utilisation de l'OCR français"
);
const ocrConfidence = bestResult.data.confidence;

console.log("🏆 Meilleur OCR :", 
  bestResult === resultLight ? "léger" : "contraste"
);

console.log("📊 Confiance retenue :", ocrConfidence, "%");

    if (!extractedText) {
      return res.status(422).json({
        message: "Aucun texte n'a pu être détecté dans le document.",
      });
    }

    console.log("📝 Texte OCR :", extractedText);
// Vérification de la qualité OCR
if (!isOcrTextReadable(extractedText)) {
  console.log("⚠️ Qualité OCR insuffisante.");

  return res.status(422).json({
    message:
      "Je n'arrive pas à lire correctement ce document. Reprenez la photo en cadrant bien le document et avec suffisamment de lumière.",
  });
}
    // 2. Instructions données à l'IA
const system = `
Tu es un assistant destiné à aider une personne âgée à comprendre un document.

Le texte que tu reçois provient d'un OCR. Il peut contenir des mots mal reconnus, incomplets ou incorrects.

RÈGLE PRINCIPALE :
Le texte OCR est ta seule source d'information.
Tu dois reformuler uniquement les informations clairement lisibles.
Tu ne dois jamais utiliser tes connaissances pour corriger, compléter, deviner ou interpréter une information.
COMPARAISON DES VERSIONS OCR :
Le document peut être fourni sous plusieurs versions OCR, par exemple :
- OCR VERSION LÉGÈRE
- OCR VERSION CONTRASTE

Ces versions proviennent exactement de la même photo.

Si une information est identique dans plusieurs versions, tu peux la considérer comme plus fiable.

Si une information importante est différente entre les versions, tu ne dois jamais choisir arbitrairement une version.

Exemples :
- "59000 Lille" dans une version et "S9000 Lille" dans une autre : indique que le code postal est incertain.
- "25 octobre 2026" dans les deux versions : tu peux conserver exactement "25 octobre 2026".
- "10 rue de Paris" dans les deux versions : tu peux conserver exactement "10 rue de Paris".

Tu ne dois jamais fusionner deux textes incorrects pour fabriquer une nouvelle information.
Tu ne dois jamais corriger toi-même une lettre ou un chiffre.
Ne mentionne jamais à l'utilisateur les termes techniques
"OCR", "version légère", "version contraste" ou "confiance OCR".

L'utilisateur doit seulement savoir si une information est lisible ou incertaine.

Si les versions OCR sont différentes, utilise une formulation simple comme :
- "Cette information n'est pas lisible avec certitude."
- "Le code postal n'est pas lisible avec certitude."
- "Une partie de cette information est difficile à lire."

Ne montre pas les différentes valeurs reconnues si elles sont contradictoires.
Règles :
- Utilise des mots simples et des phrases courtes.
- N'invente aucune information.
- Ne complète jamais une information manquante.
- Ne corrige jamais un mot qui semble mal reconnu par l'OCR.
- Ne déduis jamais la signification d'un texte incertain.
- Un mot ressemblant à un nom ne doit pas être considéré comme un nom si le contexte OCR est incertain.
- Une suite de chiffres mal reconnue ne doit pas être présentée comme une date, un âge, un montant ou un dosage certain.
- Si une information importante est mal reconnue, indique simplement qu'elle est mal lisible.
- Ne transforme jamais une information incertaine en information certaine.

Pour les documents médicaux :
- Ne donne aucun diagnostic.
- Ne donne aucun conseil médical.
- Ne donne aucune recommandation.
- Ne corrige jamais le nom d'un médicament.
- Ne corrige jamais un dosage.
- Ne corrige jamais une fréquence de prise.
- Ne déduis jamais la signification d'une abréviation médicale.
- Si l'OCR contient "cp", conserve "cp" sans expliquer sa signification.
- Si le nom d'un médicament, son dosage ou sa fréquence semble mal reconnu, indique qu'il est mal lisible au lieu de l'interpréter.

IMPORTANT :
Tu peux simplifier la formulation d'une phrase clairement reconnue, mais tu ne dois jamais modifier ses données importantes.
Les noms, dates, heures, nombres, montants, dosages et fréquences doivent rester exactement tels qu'ils apparaissent dans le texte OCR lorsqu'ils sont cités.

Ne donne aucune action ou recommandation qui n'est pas explicitement écrite dans le document.
N'ajoute jamais de section "Que faire ?", "Conseils" ou "Recommandations".
Ne propose pas de contacter un médecin, un pharmacien ou un autre professionnel sauf si cette instruction apparaît explicitement dans le texte OCR.

Si le texte est trop incomplet ou trop incorrect pour comprendre le document avec certitude, indique simplement que certaines informations n'ont pas pu être lues avec suffisamment de précision.

LANGUE DE LA RÉPONSE :

Si le document est en français :
- Réponds entièrement en français.

Si le document est en arabe :
- Réponds entièrement en arabe.
- Tous les titres et toutes les explications doivent être en arabe.
- N'utilise pas de titres ou de phrases en français.
- Ne traduis pas les informations arabes vers le français.

Si le document contient quelques caractères parasites provenant d'une mauvaise reconnaissance OCR,
ne considère pas ces caractères parasites comme une deuxième langue.
Utilise la langue principale du document.

N'utilise pas de Markdown.
N'utilise pas d'astérisques.
N'invente pas de titres contenant des informations absentes du texte OCR.
`;

    const prompt = `
Voici le texte extrait du document :

--- DÉBUT DU DOCUMENT ---

${extractedText}

--- FIN DU DOCUMENT ---

Reformule uniquement les informations clairement lisibles dans ce texte pour les rendre plus faciles à comprendre par une personne âgée.

Ne complète aucune information et signale les informations importantes qui semblent mal reconnues par l'OCR.
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