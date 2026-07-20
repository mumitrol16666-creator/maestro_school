"use client";

import { ArrowRight, BookMarked, ChevronRight, ClipboardPenLine, FolderKanban, LayoutDashboard, LibraryBig, LogOut, Megaphone, Menu, MessagesSquare, MonitorPlay, Presentation, Settings, UserCog, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatFio, initialsFromName } from "@/lib/name";
import { isContentAdminRole, roleLabel } from "@/lib/role-labels";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";
import { usePendingLessonQuestionsCount } from "@/hooks/use-pending-lesson-questions-count";
import { usePendingOnlineLessonsCount } from "@/hooks/use-pending-online-lessons-count";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";
import { useAuth } from "./auth-provider";
import { Brand } from "./brand";

const cmsNavigation = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard },
  { href: "/admin/directions", label: "Направления", icon: FolderKanban },
  { href: "/admin/courses", label: "Курсы", icon: BookMarked },
  { href: "/admin/news", label: "Доска Maestro", icon: Megaphone },
  { href: "/admin/media", label: "Медиатека", icon: LibraryBig },
];

const accessNavigation = [
  { href: "/admin/users", label: "Пользователи", icon: UserCog },
];

const lessonNavigation = [
  { href: "/admin/offline-lessons", label: "Офлайн-уроки", icon: Presentation },
  { href: "/admin/online-lessons", label: "Онлайн-уроки", icon: MonitorPlay },
];

const teacherNavigation = [
  { href: "/admin", label: "Главная", icon: LayoutDashboard },
  { href: "/admin/my-students", label: "Мои ученики", icon: UsersRound },
  ...lessonNavigation,
];

const teachingNavigation = [
  { href: "/admin/students", label: "Ученики", icon: UsersRound },
  ...lessonNavigation,
  { href: "/admin/homework-review", label: "Проверка ДЗ", icon: ClipboardPenLine },
  { href: "/admin/lesson-questions", label: "Вопросы", icon: MessagesSquare },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const isContentAdmin = isContentAdminRole(user?.role);
  const { count: pendingHomeworkCount, reload: reloadPendingHomeworkCount } = usePendingHomeworkCount(60_000, isContentAdmin);
  const { count: pendingQuestionsCount, reload: reloadPendingQuestionsCount } = usePendingLessonQuestionsCount(60_000, isContentAdmin);
  const { count: pendingOnlineLessonsCount, reload: reloadPendingOnlineLessonsCount } = usePendingOnlineLessonsCount();
  const navigation = isContentAdmin
    ? [...cmsNavigation, ...accessNavigation, ...teachingNavigation]
    : user?.role === "teacher"
      ? teacherNavigation
      : lessonNavigation;
  const sidebarTitle = isContentAdmin ? "Content CMS" : "Кабинет преподавателя";
  const headerTitle = isContentAdmin ? "Maestro Admin" : roleLabel(user?.role);
  const displayName = (user ? formatFio(user) : "")
    || user?.login
    || user?.email?.split("@")[0]
    || roleLabel(user?.role);
  const initials = user ? initialsFromName(user) : "M";
  const teacherMobileNavigation = user?.role === "teacher" ? teacherNavigation : [];

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
    <aside className="flex h-full flex-col overflow-y-auto border-r border-white/10 bg-[#151613] px-4 py-5 text-white sm:px-5 sm:py-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <Brand href="/admin" />
        <button
          type="button"
          aria-label="Закрыть меню"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setOpen(false)}
        >
          <X size={19} />
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 px-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">{sidebarTitle}</p>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-300">
          Рабочий кабинет
        </span>
      </div>

      <nav className="mt-4 space-y-1.5">{navigation.map(({ href, label, icon: Icon }) => {
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
            aria-current={active ? "page" : undefined}
            className={`group relative flex min-h-12 items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
              active
                ? "border-gold/30 bg-white text-ink shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
                : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/5 hover:text-white"
            }`}
          >
            {active ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-gold" /> : null}
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
              active ? "bg-gold/15 text-gold" : "bg-white/5 text-white/55 group-hover:bg-white/10 group-hover:text-white"
            }`}>
              <Icon size={17} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {pending != null && pending > 0 && <AdminPendingHomeworkBadge count={pending} />}
            <ChevronRight size={15} className={`shrink-0 transition ${active ? "text-gold" : "text-white/20 group-hover:translate-x-0.5 group-hover:text-white/50"}`} />
          </Link>
        );
      })}</nav>

      {!isContentAdmin ? (
        <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gold">Порядок после урока</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-white/65">
            <span>Посещаемость</span>
            <ArrowRight size={12} className="text-gold/60" />
            <span>Отчёт</span>
            <ArrowRight size={12} className="text-gold/60" />
            <span>Отправить</span>
          </div>
          <Link
            href="/admin/offline-lessons"
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-white transition hover:text-gold"
          >
            Перейти к урокам
            <ArrowRight size={13} />
          </Link>
        </div>
      ) : null}

      <Link
        href="/admin/settings"
        onClick={() => setOpen(false)}
        className="group mt-auto flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.045] p-3.5 transition hover:border-gold/30 hover:bg-white/[0.075]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gold text-sm font-black text-ink">
          {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-gold">{roleLabel(user?.role)}</span>
          <span className="mt-1 block truncate text-sm font-bold text-white">{displayName}</span>
          <span className="mt-0.5 block truncate text-[11px] text-white/40">{user?.email}</span>
        </span>
        <Settings size={16} className="shrink-0 text-white/30 transition group-hover:rotate-12 group-hover:text-gold" />
      </Link>
    </aside>
  );
  return <div className="min-h-screen bg-cream">
    <div className="fixed inset-y-0 left-0 z-40 hidden w-[272px] lg:block">{sidebar}</div>
    {open && <div className="fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] shadow-2xl lg:hidden">{sidebar}</div>}
    {open && <button className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню" />}
    <div className="lg:pl-[272px]">
      <header className="sticky top-0 z-30 flex h-[calc(68px+env(safe-area-inset-top,0px))] items-center gap-3 border-b border-stone-200/80 bg-cream/90 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl sm:h-[calc(80px+env(safe-area-inset-top,0px))] sm:px-8">
        {user?.role === "teacher" ? (
          <span className="lg:hidden">
            <Brand compact href="/admin" />
          </span>
        ) : (
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200/80 bg-white shadow-sm transition hover:border-gold/30 lg:hidden" aria-label="Открыть меню"><Menu size={20} /></button>
        )}
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-gold sm:text-xs sm:tracking-[0.18em]">{headerTitle}</p>
          <p className="hidden truncate text-sm font-semibold sm:block">{user?.email}</p>
          {pendingHomeworkCount != null && pendingHomeworkCount > 0 && (
            <Link href="/admin/homework-review?status=submitted" className="mt-1 hidden items-center gap-2 text-xs font-bold text-amber-700 hover:underline sm:inline-flex">
              На проверке: <AdminPendingHomeworkBadge count={pendingHomeworkCount} />
            </Link>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/admin/settings"
            aria-label="Настройки"
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition sm:rounded-full sm:px-4 ${
              pathname.startsWith("/admin/settings")
                ? "border-gold/30 bg-amber-50 text-amber-900"
                : "border-stone-200 bg-white text-stone-600 hover:border-gold/30"
            }`}
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Настройки</span>
          </Link>
          <button onClick={logout} aria-label="Выйти" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:rounded-full sm:px-4">
            <LogOut size={14} />
            <span className="hidden sm:inline">Выйти</span>
          </button>
        </div>
      </header>
      <main className={`mobile-safe mx-auto max-w-[1500px] p-4 sm:p-8 lg:p-10 ${
        teacherMobileNavigation.length
          ? "pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] lg:pb-10"
          : ""
      }`}>{children}</main>
    </div>
    {teacherMobileNavigation.length ? (
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-stone-200/90 bg-paper/95 px-2 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_35px_rgba(37,33,25,0.08)] backdrop-blur-xl lg:hidden"
        aria-label="Навигация преподавателя"
      >
        {teacherMobileNavigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
          const pending = href === "/admin/online-lessons" ? pendingOnlineLessonsCount : null;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-bold transition ${
                active ? "text-ink" : "text-stone-400"
              }`}
            >
              <span className={`relative grid h-9 w-12 place-items-center rounded-xl ${
                active ? "bg-amber-50 text-gold" : ""
              }`}>
                <Icon size={19} strokeWidth={2.15} />
                {pending != null && pending > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-black leading-none text-ink">
                    {pending > 9 ? "9+" : pending}
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center">{label.replace("-уроки", "")}</span>
            </Link>
          );
        })}
      </nav>
    ) : null}
  </div>;
}
