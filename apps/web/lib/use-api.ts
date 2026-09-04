"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lightweight client-side data fetcher with in-memory cache.
 *
 * - Deduplicates concurrent requests to the same URL
 * - Caches responses for `revalidateMs` (default 30s)
 * - Revalidates in the background on mount if stale
 * - Returns { data, error, isLoading, mutate }
 *
 * Usage:
 *   const { data, isLoading } = useApi<Agent[]>("/api/agents");
 *   const { mutate } = useApi<Goal[]>("/api/goals");
 *   await mutate(); // force revalidation
 */

const cache = new Map<string, { data: unknown; ts: number }>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_REVALIDATE_MS = 30_000; // 30 seconds

export function useApi<T>(
  url: string | null,
  options?: {
    revalidateMs?: number;
    enabled?: boolean;
    initialData?: T;
  },
): {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  mutate: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(options?.initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const revalidateMs = options?.revalidateMs ?? DEFAULT_REVALIDATE_MS;
  const enabled = options?.enabled !== false && url !== null;

  const fetchData = useCallback(async () => {
    if (!url) return;

    // Check cache
    const cached = cache.get(url);
    if (cached && Date.now() - cached.ts < revalidateMs) {
      setData(cached.data as T);
      setIsLoading(false);
      return;
    }

    // Deduplicate in-flight requests
    if (inflight.has(url)) {
      try {
        const result = (await inflight.get(url)) as T;
        if (mountedRef.current) {
          setData(result);
          setIsLoading(false);
        }
      } catch {
        // Error already handled by the original request
      }
      return;
    }

    const promise = fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const result = (json?.data ?? json) as T;
        cache.set(url, { data: result, ts: Date.now() });
        return result;
      })
      .finally(() => {
        inflight.delete(url);
      });

    inflight.set(url, promise);

    try {
      const result = (await promise) as T;
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Request failed");
        setIsLoading(false);
      }
    }
  }, [url, revalidateMs]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      setIsLoading(true);
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData]);

  const mutate = useCallback(async () => {
    if (url) {
      cache.delete(url);
      await fetchData();
    }
  }, [url, fetchData]);

  return { data, error, isLoading, mutate };
}

/**
 * Invalidate cache for a URL pattern.
 * Call after mutations (POST/PUT/DELETE) to ensure fresh data.
 */
export function invalidateApiCache(urlPattern: string): void {
  for (const key of cache.keys()) {
    if (key.includes(urlPattern)) {
      cache.delete(key);
    }
  }
}
