// Formats de dates en français
export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const fmtDay = (d: string | Date) =>
  new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const fmtShort = (d: string | Date) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDayCap = (d: string | Date) => capitalize(fmtDay(d));

// « 12:45 », « Hier », « 14 oct. » selon l'ancienneté
export function fmtRelative(d: string | Date) {
  const date = new Date(d);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((startToday.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (diffDays <= 0) return fmtTime(date);
  if (diffDays === 1) return "Hier";
  return fmtShort(date);
}

export const toDateInput = (d: Date) => {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const toTimeInput = (d: Date) => d.toTimeString().slice(0, 5);

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
