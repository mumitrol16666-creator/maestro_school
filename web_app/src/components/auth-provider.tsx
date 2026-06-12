"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, getAccessToken, getStoredUser, storeSession } from "@/lib/api-client";
import type { ApiAuthUser } from "@/types/api";
import type { RegisterInput } from "@/types/api";

interface AuthContextValue {
  user: ApiAuthUser | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<ApiAuthUser>;
  register: (input: RegisterInput) => Promise<ApiAuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ApiAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const cached = getStoredUser();
    api.me()
      .then((fresh) => {
        const merged = { ...cached, ...fresh };
        setUser(merged);
        storeSession(token, merged);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (login, password) => {
      const session = await api.login(login, password);
      storeSession(session.token, session.user);
      const fresh = await api.me();
      const merged = { ...session.user, ...fresh };
      storeSession(session.token, merged);
      setUser(merged);
      return merged;
    },
    register: async (input) => {
      const session = await api.register(input);
      storeSession(session.token, session.user);
      const fresh = await api.me();
      const merged = { ...session.user, ...fresh };
      storeSession(session.token, merged);
      setUser(merged);
      return merged;
    },
    logout: () => {
      clearSession();
      setUser(null);
      router.replace("/login");
    },
  }), [loading, router, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
