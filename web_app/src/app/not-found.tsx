"use client";

import { AppErrorScreen } from "@/components/app-error-screen";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { homePathForRole, isStudentRole } from "@/lib/role-labels";

const TITLE = "Такой страницы нет";
const REASON = "Возможно, ссылка устарела или в адресе опечатка.";

/** В-17: an unknown address keeps the app's face; a student keeps the bottom navigation too. */
export default function NotFound() {
  const { user, loading } = useAuth();
  const retry = () => window.location.reload();

  if (loading) return <main className="min-h-dvh bg-cream" aria-busy="true" />;
  if (user && isStudentRole(user.role)) {
    return (
      <AppShell>
        <AppErrorScreen title={TITLE} reason={REASON} onRetry={retry} />
      </AppShell>
    );
  }
  return (
    <AppErrorScreen
      fullPage
      title={TITLE}
      reason={REASON}
      onRetry={retry}
      homeHref={user ? homePathForRole(user.role) : "/login"}
    />
  );
}
