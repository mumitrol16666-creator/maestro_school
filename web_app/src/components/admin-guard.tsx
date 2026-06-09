"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ErrorState, LoadingState } from "./data-states";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  if (loading || !user) return <div className="min-h-screen bg-cream p-8"><LoadingState label="Проверяем доступ к CMS" /></div>;
  if (!["admin", "owner"].includes(user.role)) return <div className="min-h-screen bg-cream p-8"><ErrorState message="У вашей роли нет доступа к Content CMS." /></div>;
  return children;
}
