"use client";

import { BookMarked, CalendarRange, CircleUserRound, ClipboardCheck, Gift, House, ListTodo, Megaphone, Menu, MessagesSquare, School, Trophy, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStudentSchoolAlerts } from "@/hooks/use-student-school-alerts";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { useMessageMailboxStatus } from "@/hooks/use-message-mailbox-status";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { isStaffRole, isStudentRole, roleLabel, settingsPathForRole } from "@/lib/role-labels";
import { useAuth } from "./auth-provider";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";
import { Brand } from "./brand";
import { NotificationCenter } from "./teacher-notification-center";
import { PushNotificationPrompt } from "./push-notification-prompt";
import { pathMatchesAny, StudentWorkspaceContextNavigation, studentWorkspaceNavigation } from "./student-workspace-navigation";
import { UserMenu } from "./user-menu";
import { StudentUsageTracker } from "./student-usage-tracker";

type ShellNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  pathPrefixes?: readonly string[];
  studentOnly?: boolean;
  messagesOnly?: boolean;
};

const navigation: ShellNavigationItem[] = [
  { href: "/dashboard", label: "Главная", icon: House },
  { href: "/tasks", label: "Задания", icon: ListTodo, studentOnly: true },
  { href: "/monthly-plan", label: "План месяца", icon: CalendarRange, studentOnly: true },
  { href: "/courses", label: "Курсы", icon: BookMarked },
  { href: "/league", label: "Недельная лига", icon: Trophy, studentOnly: true },
  { href: "/school-lessons", label: "Уроки", icon: School, studentOnly: true },
  { href: "/tests", label: "Тесты", icon: ClipboardCheck, studentOnly: true },
  { href: "/rewards", label: "Награды", icon: Gift, studentOnly: true },
  { href: "/messages", label: "Сообщения", icon: MessagesSquare, studentOnly: true, messagesOnly: true },
  { href: "/board", label: "Доска Maestro", icon: Megaphone },
  { href: "/settings", label: "Профиль", icon: CircleUserRound },
];

const studentMobileNavigation: ShellNavigationItem[] = [
  { href: "/dashboard", label: "Главная", icon: House },
  { href: "/tasks", label: "Задания", icon: ListTodo },
  { href: "/monthly-plan", label: "План", icon: CalendarRange },
  { href: "/school-lessons", label: "Уроки", icon: School },
  { href: "/settings", label: "Профиль", icon: CircleUserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const student = isStudentRole(user?.role);
  const staff = isStaffRole(user?.role);
  const roleNavigationV2 = student && Boolean(user?.productFeatures?.roleNavigationV2);
  const points = user?.points ?? 0;
  const coins = user?.coins ?? 0;
  const { count: unreadNotifications, reload: reloadUnreadNotifications } = useUnreadNotifications(30_000);
  const learningDialogsV2 = Boolean(user?.productFeatures?.learningDialogsV2);
  const { count: unreadMessages, hasAccess: hasMessageAccess } = useMessageMailboxStatus(student, 30_000, learningDialogsV2);
  const { counts: schoolAlerts } = useStudentSchoolAlerts(student ? user?.id : undefined);
  const taskSummary = useApiResource(
    () => student ? api.studentTasks({ scope: "active", limit: 1 }) : Promise.resolve(null),
    [student, user?.id],
  );
  const taskActionCount = taskSummary.data?.data.counts.actionRequired ?? 0;
  const schoolNavigationCount = schoolAlerts.reports
    + schoolAlerts.todayLessons
    + schoolAlerts.tomorrowLessons;
  const primaryNavigation: ShellNavigationItem[] = roleNavigationV2
    ? studentWorkspaceNavigation
    : navigation;
  const mobileNavigation: ShellNavigationItem[] = roleNavigationV2
    ? studentWorkspaceNavigation
    : studentMobileNavigation;
  const messagesAvailable = roleNavigationV2 || hasMessageAccess;

  function activeNavigationItem(item: ShellNavigationItem) {
    return item.pathPrefixes
      ? pathMatchesAny(pathname, item.pathPrefixes)
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  function navigationBadge(item: ShellNavigationItem) {
    if (item.href === "/messages") return unreadMessages ?? 0;
    if (item.href === "/school-lessons") return schoolNavigationCount;
    if (item.href === "/tasks" || item.href === "/learning") return taskActionCount;
    return 0;
  }

  const sidebar = (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-white/10 bg-[#151613] px-4 py-5 text-white sm:px-5 sm:py-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <Brand />
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Закрыть меню"
        >
          <X size={19} />
        </button>
      </div>
      <nav
        className="mt-7 space-y-1.5"
        aria-label={student ? "Основная навигация ученика" : "Основная навигация"}
        data-testid={student ? "student-primary-navigation" : undefined}
      >
        {primaryNavigation.filter((item) => (
          (!item.studentOnly || (!staff && student))
          && (!item.messagesOnly || messagesAvailable)
        )).map(({ href, label, icon: Icon }) => {
          const item = primaryNavigation.find((candidate) => candidate.href === href)!;
          const active = activeNavigationItem(item);
          const badge = navigationBadge(item);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
                active
                  ? "border-gold/30 bg-white text-ink shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
                  : "border-transparent text-white/60 hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-gold" /> : null}
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                active ? "bg-gold/15 text-gold" : "bg-white/5 text-white/55 group-hover:bg-white/10 group-hover:text-white"
              }`}>
                <Icon size={18} strokeWidth={2.15} />
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge > 0 ? (
                <AdminPendingHomeworkBadge count={badge} />
              ) : null}
            </Link>
          );
        })}
      </nav>
      {!roleNavigationV2 ? (
        <Link
          href={settingsPathForRole(user?.role)}
          onClick={() => setOpen(false)}
          className="mt-auto rounded-[22px] border border-white/10 bg-white/[0.045] p-4 transition hover:border-gold/25 hover:bg-white/[0.075]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">{roleLabel(user?.role)}</p>
          {student ? (
            <p className="mt-2 text-sm font-semibold">
              {points.toLocaleString("ru-RU")} баллов · {coins.toLocaleString("ru-RU")} Coins
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold">{user?.email}</p>
          )}
          <p className="mt-2 text-xs text-white/40">Открыть профиль</p>
        </Link>
      ) : null}
    </aside>
  );

  return (
    <div className="min-h-screen bg-cream">
      <div className="fixed inset-y-0 left-0 hidden w-[272px] lg:block">{sidebar}</div>
      {open && <div className="fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] shadow-2xl lg:hidden">{sidebar}</div>}
      {open && <button className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню по фону" />}
      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-30 flex h-[calc(68px+env(safe-area-inset-top,0px))] items-center gap-3 border-b border-stone-200/70 bg-cream/90 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl sm:px-8">
          {student ? (
            <div className="flex items-center gap-2 lg:hidden">
              <Brand compact />
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200/80 bg-white shadow-sm transition hover:border-gold/30"
                aria-label="Открыть все разделы"
                title="Все разделы"
              >
                <Menu size={19} />
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200/80 bg-white shadow-sm transition hover:border-gold/30 lg:hidden" aria-label="Открыть меню"><Menu size={20} /></button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <NotificationCenter
                userId={user.id}
                unreadCount={unreadNotifications}
                reloadUnread={reloadUnreadNotifications}
                audience={student ? "student" : "staff"}
              />
            ) : null}
            <UserMenu />
          </div>
        </header>
        <main className={`mobile-safe mx-auto max-w-[1500px] p-4 sm:p-8 lg:p-10 ${
          student ? "pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] lg:pb-10" : ""
        }`}>
          {roleNavigationV2 ? (
            <div className={student && pathname.startsWith("/messages") ? "hidden md:block" : ""}>
              <StudentWorkspaceContextNavigation />
            </div>
          ) : null}
          {children}
        </main>
      </div>
      {student ? (
        <nav
          data-testid="student-mobile-navigation"
          data-mobile-app-navigation
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-stone-200/90 bg-paper/95 px-2 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_35px_rgba(37,33,25,0.08)] backdrop-blur-xl lg:hidden"
          aria-label="Основная навигация"
        >
          {mobileNavigation.filter((item) => !item.messagesOnly || messagesAvailable).map(({ href, label, icon: Icon }) => {
            const item = mobileNavigation.find((candidate) => candidate.href === href)!;
            const active = activeNavigationItem(item);
            const badge = navigationBadge(item);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-bold transition ${
                  active ? "text-ink" : "text-stone-400"
                }`}
              >
                <span className={`relative grid h-9 w-11 place-items-center rounded-xl ${
                  active ? "bg-amber-50 text-gold" : ""
                }`}>
                  <Icon size={19} strokeWidth={2.15} />
                  {badge != null && badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-black leading-none text-ink">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className="w-full truncate text-center">{label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
      {student && user ? (
        <>
          <StudentUsageTracker />
          <PushNotificationPrompt userId={user.id} audience="student" />
        </>
      ) : null}
    </div>
  );
}
