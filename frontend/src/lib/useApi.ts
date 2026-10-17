"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// Charge une ressource GET ; `reload()` la recharge après une modification
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await api.get<T>(path);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload, setData };
}
