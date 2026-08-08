"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "./data-states";
import { useAuth } from "./auth-provider";
import { homePathForRole, isStaffRole } from "@/lib/role-labels";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "parent" || isStaffRole(user.role)) {
      router.replace(homePathForRole(user.role));
    }
  }, [loading, router, user]);

  if (loading || !user || user.role === "parent" || isStaffRole(user.role)) {
    return <div className="min-h-screen bg-cream p-8"><LoadingState label="Открываем ваш кабинет" /></div>;
  }
  return children;
}
