"use client";

import { BookOpen, GraduationCap, Home, Menu, Newspaper, UserRound, Video, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { isStaffRole, isStudentRole, roleLabel, settingsPathForRole } from "@/lib/role-labels";
import { useAuth } from "./auth-provider";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";
import { Brand } from "./brand";
import { UserMenu } from "./user-menu";

const navigation = [
  { href: "/dashboard", label: "Главная", icon: Home },
  { href: "/courses", label: "Курсы", icon: BookOpen },
  { href: "/school-lessons", label: "Уроки в школе", icon: GraduationCap, studentOnly: true },
  { href: "/online-lessons", label: "Онлайн-уроки", icon: Video },
  { href: "/board", label: "Доска Maestro", icon: Newspaper },
  { href: "/settings", label: "Профиль", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const student = isStudentRole(user?.role);
  const staff = isStaffRole(user?.role);
  const points = user?.points ?? 0;
  const coins = user?.coins ?? 0;
  const { count: unreadNotifications } = useUnreadNotifications();

  const sidebar = (
    <aside className="flex h-full flex-col bg-ink px-5 py-6 text-white">
      <div className="flex items-center justify-between">
        <Brand />
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню"><X /></button>
      </div>
      <nav className="mt-12 space-y-1.5">
        {navigation.filter((item) => !item.studentOnly || (!staff && student)).map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                active ? "bg-white text-ink shadow-sm" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={18} className={active ? "text-gold" : undefined} />
              <span className="flex-1">{label}</span>
              {href === "/online-lessons" && unreadNotifications != null && unreadNotifications > 0 ? (
                <AdminPendingHomeworkBadge count={unreadNotifications} />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <Link
        href={settingsPathForRole(user?.role)}
        onClick={() => setOpen(false)}
        className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:border-gold/25 hover:bg-white/10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">{roleLabel(user?.role)}</p>
        {student ? (
          <p className="mt-2 text-sm font-semibold">
            {points.toLocaleString("ru-RU")} баллов · {coins.toLocaleString("ru-RU")} Coins
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold">{user?.email}</p>
        )}
        <p className="mt-2 text-xs text-white/40">Открыть профиль →</p>
      </Link>
    </aside>
  );

  return (
    <div className="min-h-screen bg-cream">
      <div className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</div>
      {open && <div className="fixed inset-0 z-50 w-72 shadow-2xl lg:hidden">{sidebar}</div>}
      {open && <button className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню по фону" />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-stone-200/70 bg-cream/85 px-5 backdrop-blur-xl sm:px-8">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-stone-200/80 bg-white shadow-sm transition hover:border-gold/30 lg:hidden" aria-label="Открыть меню"><Menu size={20} /></button>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
