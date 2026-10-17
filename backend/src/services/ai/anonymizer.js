// Anonymisation avant tout appel LLM : les noms réels et numéros sont remplacés
// par des jetons ([PERSONNE_1], [TEL_1]…), puis restitués dans la réponse.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PHONE_RE = /(\+?\d[\d .-]{7,}\d)/g;

export function createAnonymizer(names = []) {
  const map = new Map(); // jeton -> valeur réelle
  const cleanNames = [...new Set(names.filter((n) => n && n.trim().length > 1).map((n) => n.trim()))]
    // Les noms les plus longs d'abord : « Marie Dupont » avant « Marie »
    .sort((a, b) => b.length - a.length);

  let personCount = 0;
  let phoneCount = 0;
  const tokenFor = new Map(); // valeur réelle (minuscules) -> jeton

  function anonymize(text) {
    let out = String(text ?? "");
    for (const name of cleanNames) {
      const re = new RegExp(`\\b${escapeRe(name)}\\b`, "gi");
      out = out.replace(re, (match) => {
        const k = match.toLowerCase();
        if (!tokenFor.has(k)) {
          const token = `[PERSONNE_${++personCount}]`;
          tokenFor.set(k, token);
          map.set(token, match);
        }
        return tokenFor.get(k);
      });
    }
    out = out.replace(PHONE_RE, (match) => {
      const token = `[TEL_${++phoneCount}]`;
      map.set(token, match);
      return token;
    });
    return out;
  }

  function deanonymize(text) {
    let out = String(text ?? "");
    for (const [token, value] of map) out = out.split(token).join(value);
    return out;
  }

  return { anonymize, deanonymize, tokens: () => [...map.keys()] };
}
