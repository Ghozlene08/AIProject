"use client";

type TokenPayload = { sub?: string; id?: string; _id?: string; role?: string; exp?: number };

// ⚠️ Must match the key your login code uses in localStorage
const TOKEN_KEY = "token";

export function getStoredToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

export function decodeToken(token: string | null): TokenPayload | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Caregiver id = `sub` claim of the JWT stored in localStorage. */
export function getCaregiverId(): string | null {
  const payload = decodeToken(getStoredToken());
  if (!payload) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expired token
  return payload.sub || payload.id || payload._id || null;
}