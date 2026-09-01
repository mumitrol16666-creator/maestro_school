"use client";

import { House, MessagesSquare, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { useMessageMailboxStatus } from "@/hooks/use-message-mailbox-status";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";
import { useAuth } from "./auth-provider";
import { Brand } from "./brand";
import { NotificationCenter } from "./teacher-notification-center";
import { PushNotificationPrompt } from "./push-notification-prompt";
import { UserMenu } from "./user-menu";

const baseParentNavigation = [
  { href: "/family", label: "Семья", icon: House, exact: true },
];

export function ParentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { count: unreadNotifications, reload: reloadUnreadNotifications } = useUnreadNotifications();
  const learningDialogsV2 = Boolean(user?.productFeatures?.learningDialogsV2);
  const { count: unreadMessages } = useMessageMailboxStatus(learningDialogsV2, 30_000, true);
  const parentNavigation = [
    ...baseParentNavigation,
    ...(learningDialogsV2
      ? [{ href: "/family/messages", label: "Сообщения", icon: MessagesSquare, exact: false }]
      : []),
    { href: "/family/settings", label: "Настройки", icon: Settings, exact: false },
  ];

  function isActive(item: typeof parentNavigation[number]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <div className="min-h-screen bg-cream">
      <aside className="fixed inset-y-0 left-0 hidden w-[272px] flex-col border-r border-white/10 bg-[#151613] px-5 py-6 text-white lg:flex">
        <div className="border-b border-white/10 pb-5">
          <Brand />
          <p className="mt-3 flex items-center gap-2 text-xs font-bold text-white/45">
            <ShieldCheck size={14} className="text-gold" />
            Семейный кабинет
          </p>
        </div>
        <nav className="mt-7 space-y-2">
          {parentNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition ${
                  active
                    ? "border-gold/30 bg-white text-ink"
                    : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${
                  active ? "bg-gold/15 text-gold" : "bg-white/5"
                }`}>
                  <Icon size={18} />
                </span>
                {item.label}
                {item.href === "/family/messages" && unreadMessages != null && unreadMessages > 0 ? (
                  <span className="ml-auto"><AdminPendingHomeworkBadge count={unreadMessages} /></span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Доступ родителя</p>
          <p className="mt-2 text-xs leading-5 text-white/50">
            Расписание, баланс, учебный план и достижения в пределах доступа ученика.
          </p>
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-30 flex h-[calc(68px+env(safe-area-inset-top,0px))] items-center border-b border-stone-200/70 bg-cream/90 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl sm:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <p className="ml-3 hidden text-xs font-bold uppercase tracking-[0.16em] text-stone-400 sm:block lg:ml-0">
            Семейный кабинет
          </p>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <NotificationCenter
                userId={user.id}
                unreadCount={unreadNotifications}
                reloadUnread={reloadUnreadNotifications}
                audience="parent"
              />
            ) : null}
            <UserMenu />
          </div>
        </header>
        <main className="mobile-safe mx-auto max-w-[1400px] p-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:p-8 lg:p-10">
          {children}
        </main>
      </div>

      <nav data-mobile-app-navigation className={`fixed inset-x-0 bottom-0 z-40 grid ${learningDialogsV2 ? "grid-cols-3" : "grid-cols-2"} border-t border-stone-200/90 bg-paper/95 px-2 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_35px_rgba(37,33,25,0.08)] backdrop-blur-xl lg:hidden`}>
        {parentNavigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold ${
                active ? "text-ink" : "text-stone-400"
              }`}
            >
              <span className={`relative grid h-9 w-12 place-items-center rounded-xl ${
                active ? "bg-amber-50 text-gold" : ""
              }`}>
                <Icon size={19} />
                {item.href === "/family/messages" && unreadMessages != null && unreadMessages > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-black leading-none text-ink">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      {user ? <PushNotificationPrompt userId={user.id} audience="parent" /> : null}
    </div>
  );
}
