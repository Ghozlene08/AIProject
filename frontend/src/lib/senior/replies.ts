/**
 * Comprendre les réponses « oui » / « non » du senior, sans IA (instantané, gratuit, toujours disponible).
 * Le « non » est testé en premier : « non merci » est un refus, même s'il contient « merci ».
 */
const normalize = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z' ]/g, " ")} `;

const NO = [" non ", " pas maintenant ", " plus tard ", " ca suffit ", " arrete ", " pas envie ", " une autre fois "];
const YES = [" oui ", " ouais ", " d'accord ", " daccord ", " volontiers ", " vas-y ", " vas y ", " ok ", " bien sur ", " pourquoi pas ", " allons-y ", " allons y ", " avec plaisir "];

export const saysNo = (text: string | null) => !!text && NO.some((w) => normalize(text).includes(w));
export const saysYes = (text: string | null) => !!text && !saysNo(text) && YES.some((w) => normalize(text).includes(w));
