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

  if (loading || !user) return <div className="min-h-screen bg-cream p-8"><LoadingState label="Проверяем доступ к кабинету" /></div>;
  const staffRoles = ["admin", "owner", "super_admin", "teacher", "curator", "branch_manager"];
  if (!staffRoles.includes(user.role)) {
    return <div className="min-h-screen bg-cream p-8"><ErrorState message="У вашей роли нет доступа к панели преподавателя." /></div>;
  }
  return children;
}
