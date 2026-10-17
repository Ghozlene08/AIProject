// Petites fonctions de dates (heure locale du serveur)
export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Combine un jour et un horaire "HH:MM"
export const atTime = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const x = new Date(day);
  x.setHours(h, m, 0, 0);
  return x;
};

export const formatFr = (d, opts = { weekday: "long", day: "numeric", month: "long" }) =>
  new Date(d).toLocaleDateString("fr-FR", opts);

export const timeFr = (d) =>
  new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
