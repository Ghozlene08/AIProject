"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export type SosEvent = {
  alertId: string;
  seniorId: string;
  seniorName: string;
  type: "sos" | "checkin_manque";
  severity: "haute";
  title: string;
  message: string;
  createdAt: string;
  checkInId?: string;
};

const OBJECT_ID = /^[a-f\d]{24}$/i;
const IS_DEV = process.env.NODE_ENV !== "production";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

// Keys used by your app, in priority order (your DevTools shows sa_token, token, userId)
const TOKEN_KEYS = ["sa_token", "token"];

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  for (const key of TOKEN_KEYS) {
    const v = localStorage.getItem(key)?.trim().replace(/^"|"$/g, "");
    if (v) return v;
  }
  return null;
}

// Caregiver id stored by your login under "userId"
function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem("userId")?.trim().replace(/^"|"$/g, "");
  return v && OBJECT_ID.test(v) ? v : null;
}

let socket: Socket | null = null;
let lastErrorMessage = "";

export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;

  const userId = IS_DEV ? getStoredUserId() : null;
  const token = getAuthToken();
  if (!userId && !token) return null;

  if (!socket) {
    socket = io(SOCKET_URL, {
      // Callback form: every reconnection sends fresh credentials
      auth: (cb) => {
        const id = IS_DEV ? getStoredUserId() : null;
        // Dev: the stored userId wins, so a stale/invalid token can't block the socket.
        // Production: only the JWT is sent (the server ignores userId there anyway).
        if (id) return cb({ userId: id });
        cb({ token: getAuthToken() });
      },
      // Websocket first, polling as a fallback (clearer errors, works behind proxies)
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on("connect", () => {
      lastErrorMessage = "";
      const id = IS_DEV ? getStoredUserId() : null;
      console.log("socket connected:", socket?.id, "| stored userId:", id);
      // Safety net (dev only, ignored by the server in production)
      if (id) socket!.emit("test:join-user", id);
    });

    socket.on("connect_error", (err) => {
      // Log each distinct message once, not on every reconnect attempt
      if (err.message === lastErrorMessage) return;
      lastErrorMessage = err.message;
      console.warn(`Socket error: ${err.message} (server: ${SOCKET_URL})`);
    });
  }
  return socket;
}

/** Call this on logout so the next user doesn't reuse the old connection. */
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  lastErrorMessage = "";
}

/** Subscribe to live urgent events (SOS and missed check-ins) for the lifetime of a component. */
export function useSosEvents(handler: (event: SosEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const listener = (event: SosEvent) => ref.current(event);
    s.on("sos:alert", listener);
    return () => {
      s.off("sos:alert", listener);
    };
  }, []);
}