"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api, ApiError, clearSession, getAccessToken, getStoredUser, markSessionRenewed, sessionRenewalDue, storeSession,
} from "@/lib/api-client";
import type { ApiAuthUser } from "@/types/api";
import type { RegisterInput } from "@/types/api";

interface AuthContextValue {
  user: ApiAuthUser | null;
  loading: boolean;
  login: (
    phone: string,
    password: string,
    profile?: "student" | "parent" | "staff",
  ) => Promise<ApiAuthUser>;
  loginWithSso: (ssoToken: string) => Promise<ApiAuthUser>;
  register: (input: RegisterInput) => Promise<ApiAuthUser>;
  refreshUser: () => Promise<ApiAuthUser | null>;
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
    let checkedOnline = false;
    const confirm = () => {
      // An answer belongs to the session that asked: after a sign-out, or a sign-in as someone else,
      // it must not be written over the new state.
      const asked = getAccessToken();
      return api.me().then((fresh) => {
        if (getAccessToken() !== asked) return;
        checkedOnline = true;
        const merged = { ...cached, ...fresh };
        setUser(merged);
        storeSession(asked ?? token, merged);
        // В-41: only the student's sign-in is renewed (30 days from the last visit); the server refuses
        // other roles. The new token comes with the media cookie. A 401 signs out in the API client; no
        // network or a 5xx changes nothing and the next opening tries again.
        if (merged.role === "student" && sessionRenewalDue()) {
          void api.refreshSession()
            .then((renewed) => {
              if (!renewed?.token || getAccessToken() !== asked) return;
              const next = { ...getStoredUser(), ...renewed.user };
              storeSession(renewed.token, next);
              markSessionRenewed();
              setUser(next);
            })
            .catch(() => undefined);
        } else {
          // Sessions signed in before plan 1.12 have no media cookie yet; refreshing keeps it current.
          void api.refreshMediaSession().catch(() => undefined);
        }
      });
    };
    // В-18, З-14: no network or a server hiccup is not a logout. The session stays on the saved
    // profile and is checked again when the connection returns; only a rejected token (401,
    // handled by the API client) or a missing profile sends the user to the sign-in screen.
    const onOnline = () => {
      if (!checkedOnline && getAccessToken()) void confirm().catch(() => undefined);
    };
    window.addEventListener("online", onOnline);
    confirm()
      .catch((reason) => {
        const transient = reason instanceof ApiError && (reason.status === 0 || reason.status >= 500);
        setUser(transient && cached ? cached : null);
      })
      .finally(() => setLoading(false));
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (phone, password, profile) => {
      const session = await api.login(phone, password, profile);
      storeSession(session.token, session.user);
      markSessionRenewed();
      const fresh = await api.me();
      const merged = { ...session.user, ...fresh };
      storeSession(session.token, merged);
      setUser(merged);
      return merged;
    },
    loginWithSso: async (ssoToken) => {
      const session = await api.ssoExchange(ssoToken);
      storeSession(session.token, session.user);
      markSessionRenewed();
      const fresh = await api.me();
      const merged = { ...session.user, ...fresh };
      storeSession(session.token, merged);
      setUser(merged);
      return merged;
    },
    register: async (input) => {
      const session = await api.register(input);
      storeSession(session.token, session.user);
      markSessionRenewed();
      const fresh = await api.me();
      const merged = { ...session.user, ...fresh };
      storeSession(session.token, merged);
      setUser(merged);
      return merged;
    },
    refreshUser: async () => {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        return null;
      }
      const fresh = await api.me();
      const cached = getStoredUser();
      const merged = { ...cached, ...fresh };
      storeSession(token, merged);
      setUser(merged);
      return merged;
    },
    logout: () => {
      void api.clearMediaSession().catch(() => undefined);
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
