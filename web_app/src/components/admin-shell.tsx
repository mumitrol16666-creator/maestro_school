"use client";

import { BookOpen, ClipboardCheck, FolderOpen, LayoutDashboard, Library, LogOut, Menu, Newspaper, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { Brand } from "./brand";

const navigation = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard },
  { href: "/admin/directions", label: "Направления", icon: FolderOpen },
  { href: "/admin/courses", label: "Курсы", icon: BookOpen },
  { href: "/admin/homework-review", label: "Проверка ДЗ", icon: ClipboardCheck },
  { href: "/admin/news", label: "Доска Maestro", icon: Newspaper },
  { href: "/admin/media", label: "Медиатека", icon: Library },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const sidebar = (
    <aside className="flex h-full flex-col bg-ink px-5 py-6 text-white">
      <div className="flex items-center justify-between"><Brand /><button className="lg:hidden" onClick={() => setOpen(false)}><X /></button></div>
      <p className="mt-8 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Content CMS</p>
      <nav className="mt-4 space-y-2">{navigation.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${active ? "bg-white text-ink" : "text-white/55 hover:bg-white/5 hover:text-white"}`}><Icon size={18} />{label}</Link>;
      })}</nav>
      <button onClick={logout} className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/60 hover:text-white"><LogOut size={17} /> Выйти</button>
    </aside>
  );
  return <div className="min-h-screen bg-cream">
    <div className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</div>
    {open && <div className="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl lg:hidden">{sidebar}</div>}
    {open && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Закрыть меню" />}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-stone-200/80 bg-cream/90 px-5 backdrop-blur-xl sm:px-8">
        <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full bg-white lg:hidden"><Menu size={20} /></button>
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Maestro Admin</p><p className="text-sm font-semibold">{user?.email}</p></div>
        <button onClick={logout} className="ml-auto rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold">Выйти</button>
      </header>
      <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">{children}</main>
    </div>
  </div>;
}
