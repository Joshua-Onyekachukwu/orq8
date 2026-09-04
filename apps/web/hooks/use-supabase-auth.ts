"use client";

import { useState, useCallback, useEffect } from "react";
import { getSupabaseBrowser } from "../lib/supabase-browser";

interface AuthUser {
  id: string;
  email: string | undefined;
}

interface UseSupabaseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, orgName?: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

/**
 * Hook for Supabase Auth operations.
 * Bridges Supabase Auth with ORQ8's session system.
 */
export function useSupabaseAuth(): UseSupabaseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email,
          });
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  const signUp = useCallback(async (email: string, password: string, orgName?: string) => {
    try {
      const res = await fetch("/api/auth/supabase/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, org_name: orgName }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error?.message || "Signup failed" };
      setUser(data.data?.user);
      return {};
    } catch {
      return { error: "Network error" };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/supabase/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error?.message || "Login failed" };
      setUser(data.data?.user);
      return {};
    } catch {
      return { error: "Network error" };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/supabase/logout", { method: "POST" });
      setUser(null);
    } catch {
      // Silent fail
    }
  }, []);

  return { user, loading, signUp, signIn, signOut };
}
