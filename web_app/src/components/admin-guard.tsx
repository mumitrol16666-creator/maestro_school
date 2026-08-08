"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePathForRole, isStaffRole } from "@/lib/role-labels";
import { useAuth } from "./auth-provider";
import { LoadingState } from "./data-states";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isStaffRole(user.role)) router.replace(homePathForRole(user.role));
  }, [loading, router, user]);

  if (loading || !user || !isStaffRole(user.role)) {
    return <div className="min-h-screen bg-cream p-8"><LoadingState label="Открываем ваш кабинет" /></div>;
  }
  return children;
}
