"use client";

import { ChevronDown, Coins, LogOut, Settings, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Пользователь";
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : fullName.slice(0, 2).toUpperCase();
  const roleLabel = user?.role === "student" ? "Ученик" : user?.role === "admin" ? "Администратор" : user?.role ?? "";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-full border border-stone-200/90 bg-white py-1.5 pl-1.5 pr-3 shadow-sm transition hover:border-gold/35 hover:shadow-soft sm:gap-3"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-gold ring-2 ring-gold/15">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-bold leading-tight">{fullName}</span>
          <span className="block text-[11px] text-stone-400">{roleLabel}</span>
        </span>
        <ChevronDown size={14} className={`hidden text-stone-400 transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-[22px] border border-stone-200 bg-paper shadow-soft"
        >
          <div className="border-b border-stone-100 bg-stone-50/90 px-4 py-3.5">
            <p className="truncate text-sm font-bold">{fullName}</p>
            <p className="mt-0.5 truncate text-xs text-stone-400">{user?.email}</p>
          </div>
          <div className="space-y-1 p-2">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              <Settings size={16} className="text-gold" />
              Профиль и настройки
            </Link>
            <div className="mx-1 space-y-1">
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                <Star size={14} className="text-gold" fill="currentColor" />
                {(user?.points ?? 0).toLocaleString("ru-RU")} баллов Maestro
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700">
                <Coins size={14} className="text-gold" />
                {(user?.coins ?? 0).toLocaleString("ru-RU")} Maestro Coins
              </div>
            </div>
          </div>
          <div className="border-t border-stone-100 p-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
            >
              <LogOut size={16} />
              Выйти из кабинета
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
