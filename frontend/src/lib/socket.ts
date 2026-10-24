"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getStoredToken } from "@/lib/token";

export type SosEvent = {
  alertId: string;
  seniorId: string;
  seniorName: string;
  type: "sos" | "checkin_manque"; // ← was "sos"
  severity: "haute";
  title: string;
  message: string;
  createdAt: string;
  checkInId?: string; // ← only for missed check-ins
};

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined" || !getStoredToken()) return null;

  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000", {
      // Callback form: every reconnection sends the freshest token
      auth: (cb) => cb({ token: getStoredToken() }),
      transports: ["websocket"],
    });
  }
  return socket;
}

/** Call this on logout so the next user doesn't reuse the old connection. */
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
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