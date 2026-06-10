"use client";

import { BookOpen, Home, Menu, Newspaper, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { Brand } from "./brand";

const navigation = [
  { href: "/dashboard", label: "Главная", icon: Home },
  { href: "/courses", label: "Курсы", icon: BookOpen },
  { href: "/board", label: "Доска Maestro", icon: Newspaper },
  { href: "/settings", label: "Профиль", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Пользователь";
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : fullName.slice(0, 2).toUpperCase();
  const roleLabel = user?.role === "student" ? "Ученик" : user?.role === "admin" ? "Администратор" : user?.role ?? "";
  const points = user?.points ?? 0;

  const sidebar = (
    <aside className="flex h-full flex-col bg-ink px-5 py-6 text-white">
      <div className="flex items-center justify-between">
        <Brand />
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню"><X /></button>
      </div>
      <nav className="mt-12 space-y-2">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                active ? "bg-white text-ink" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">{roleLabel}</p>
        <p className="mt-2 text-sm font-semibold">{points.toLocaleString("ru-RU")} баллов Maestro</p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-cream">
      <div className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</div>
      {open && <div className="fixed inset-0 z-50 w-72 shadow-2xl lg:hidden">{sidebar}</div>}
      {open && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню по фону" />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-stone-200/80 bg-cream/90 px-5 backdrop-blur-xl sm:px-8">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white lg:hidden" aria-label="Открыть меню"><Menu size={20} /></button>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={logout} title="Выйти из кабинета" className="grid h-10 w-10 place-items-center rounded-full bg-ink text-xs font-bold text-white">{initials}</button>
            <button onClick={logout} title="Выйти из кабинета" className="hidden text-left sm:block">
              <p className="text-sm font-bold">{fullName}</p>
              <p className="text-xs text-stone-400">{roleLabel}</p>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
