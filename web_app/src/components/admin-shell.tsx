"use client";

import { BookOpen, ClipboardCheck, FolderOpen, GraduationCap, LayoutDashboard, Library, LogOut, Menu, MessageCircleQuestion, Newspaper, Settings, UserCog, Users, Video, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isContentAdminRole, roleLabel } from "@/lib/role-labels";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";
import { usePendingLessonQuestionsCount } from "@/hooks/use-pending-lesson-questions-count";
import { usePendingOnlineLessonsCount } from "@/hooks/use-pending-online-lessons-count";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";
import { useAuth } from "./auth-provider";
import { Brand } from "./brand";

const cmsNavigation = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard },
  { href: "/admin/directions", label: "Направления", icon: FolderOpen },
  { href: "/admin/courses", label: "Курсы", icon: BookOpen },
  { href: "/admin/news", label: "Доска Maestro", icon: Newspaper },
  { href: "/admin/media", label: "Медиатека", icon: Library },
];

const accessNavigation = [
  { href: "/admin/users", label: "Пользователи", icon: UserCog },
];

const lessonNavigation = [
  { href: "/admin/offline-lessons", label: "Офлайн-уроки", icon: GraduationCap },
  { href: "/admin/online-lessons", label: "Онлайн-уроки", icon: Video },
];

const teacherNavigation = [
  { href: "/admin/my-students", label: "Мои ученики", icon: Users },
  ...lessonNavigation,
];

const teachingNavigation = [
  { href: "/admin/students", label: "Ученики", icon: Users },
  ...lessonNavigation,
  { href: "/admin/homework-review", label: "Проверка ДЗ", icon: ClipboardCheck },
  { href: "/admin/lesson-questions", label: "Вопросы", icon: MessageCircleQuestion },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { count: pendingHomeworkCount, reload: reloadPendingHomeworkCount } = usePendingHomeworkCount();
  const { count: pendingQuestionsCount, reload: reloadPendingQuestionsCount } = usePendingLessonQuestionsCount();
  const { count: pendingOnlineLessonsCount, reload: reloadPendingOnlineLessonsCount } = usePendingOnlineLessonsCount();
  const isContentAdmin = isContentAdminRole(user?.role);
  const navigation = isContentAdmin
    ? [...cmsNavigation, ...accessNavigation, ...teachingNavigation]
    : user?.role === "teacher"
      ? teacherNavigation
      : lessonNavigation;
  const sidebarTitle = isContentAdmin ? "Content CMS" : "Кабинет преподавателя";
  const headerTitle = isContentAdmin ? "Maestro Admin" : roleLabel(user?.role);

  useEffect(() => {
    if (pathname.startsWith("/admin/homework-review")) {
      void reloadPendingHomeworkCount();
    }
    if (pathname.startsWith("/admin/lesson-questions")) {
      void reloadPendingQuestionsCount();
    }
    if (pathname.startsWith("/admin/online-lessons")) {
      void reloadPendingOnlineLessonsCount();
    }
  }, [pathname, reloadPendingHomeworkCount, reloadPendingQuestionsCount, reloadPendingOnlineLessonsCount]);

  const sidebar = (
    <aside className="flex h-full flex-col bg-ink px-5 py-6 text-white">
      <div className="flex items-center justify-between"><Brand /><button className="lg:hidden" onClick={() => setOpen(false)}><X /></button></div>
      <p className="mt-8 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">{sidebarTitle}</p>
      <nav className="mt-4 space-y-2">{navigation.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        const pending = href === "/admin/homework-review"
          ? pendingHomeworkCount
          : href === "/admin/lesson-questions"
            ? pendingQuestionsCount
            : href === "/admin/online-lessons"
              ? pendingOnlineLessonsCount
              : null;
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
              active ? "bg-white text-ink" : "text-white/55 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {pending != null && pending > 0 && <AdminPendingHomeworkBadge count={pending} />}
          </Link>
        );
      })}</nav>
      <Link
        href="/admin/settings"
        onClick={() => setOpen(false)}
        className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:border-gold/25 hover:bg-white/10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">{roleLabel(user?.role)}</p>
        <p className="mt-2 truncate text-sm font-semibold">{user?.email}</p>
        <p className="mt-2 text-xs text-white/40">Настройки аккаунта →</p>
      </Link>
    </aside>
  );
  return <div className="min-h-screen bg-cream">
    <div className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</div>
    {open && <div className="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl lg:hidden">{sidebar}</div>}
    {open && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню" />}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-stone-200/80 bg-cream/90 px-5 backdrop-blur-xl sm:px-8">
        <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white lg:hidden"><Menu size={20} /></button>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{headerTitle}</p>
          <p className="text-sm font-semibold">{user?.email}</p>
          {pendingHomeworkCount != null && pendingHomeworkCount > 0 && (
            <Link href="/admin/homework-review?status=submitted" className="mt-1 inline-flex items-center gap-2 text-xs font-bold text-amber-700 hover:underline">
              На проверке: <AdminPendingHomeworkBadge count={pendingHomeworkCount} />
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/settings"
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${
              pathname.startsWith("/admin/settings")
                ? "border-gold/30 bg-amber-50 text-amber-900"
                : "border-stone-200 bg-white text-stone-600 hover:border-gold/30"
            }`}
          >
            <Settings size={14} />
            Настройки
          </Link>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700">
            <LogOut size={14} />
            Выйти
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">{children}</main>
    </div>
  </div>;
}
