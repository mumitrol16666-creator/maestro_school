"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { LoadingState } from "./data-states";
import { isStaffRole } from "@/lib/role-labels";

export function ParentGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "parent") {
      router.replace(isStaffRole(user.role) ? "/admin" : "/dashboard");
    }
  }, [loading, router, user]);

  if (loading || !user || user.role !== "parent") {
    return (
      <div className="min-h-screen bg-cream p-8">
        <LoadingState label="Открываем семейный кабинет" />
      </div>
    );
  }
  return children;
}
