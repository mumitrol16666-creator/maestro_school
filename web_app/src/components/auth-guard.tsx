"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "./data-states";
import { useAuth } from "./auth-provider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  if (loading || !user) return <div className="min-h-screen bg-cream p-8"><LoadingState label="Проверяем вход в кабинет" /></div>;
  return children;
}
