"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingState } from "./data-states";
import { useAuth } from "./auth-provider";
import { EXTERNAL_HOME_PATH, externalMayOpen, isExternalStudent } from "@/lib/course-access-format";
import { homePathForRole, isStaffRole } from "@/lib/role-labels";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Stage 4: the school's screens (schedule, sector, league, school homework…) are not for a student outside the school.
  const sentToCourses = isExternalStudent(user) && !externalMayOpen(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "parent" || isStaffRole(user.role)) {
      router.replace(homePathForRole(user.role));
      return;
    }
    if (sentToCourses) router.replace(EXTERNAL_HOME_PATH);
  }, [loading, router, sentToCourses, user]);

  if (loading || !user || user.role === "parent" || isStaffRole(user.role) || sentToCourses) {
    return <div className="min-h-screen bg-cream p-8"><LoadingState label="Открываем ваш кабинет" /></div>;
  }
  return children;
}
