"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "./api";
import type { Role, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, role?: Role) => Promise<User>;
  register: (data: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  logout: () => void;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Au chargement : restaure la session à partir du jeton enregistré
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!tokenStore.get()) return setLoading(false);
      try {
        const { user } = await api.get<{ user: User }>("/auth/me");
        if (!cancelled) setUser(user);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    restore();
    const onLogout = () => setUser(null);
    window.addEventListener("sa:logout", onLogout);
    return () => {
      cancelled = true;
      window.removeEventListener("sa:logout", onLogout);
    };
  }, []);

  const login = useCallback(async (email: string, password: string, role?: Role) => {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password, role });
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (data: { name: string; email: string; password: string; phone?: string }) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", data);
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
