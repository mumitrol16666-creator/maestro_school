"use client";

import {
  BookMarked,
  CalendarDays,
  ClipboardCheck,
  Ellipsis,
  ExternalLink,
  Gift,
  GraduationCap,
  History,
  House,
  ListTodo,
  MessagesSquare,
  ShoppingBag,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type StudentWorkspaceNavigationItem = {
  id: "home" | "learning" | "schedule" | "messages" | "shop";
  href: string;
  label: string;
  icon: LucideIcon;
  pathPrefixes: readonly string[];
  messagesOnly?: boolean;
};

export const studentWorkspaceNavigation: StudentWorkspaceNavigationItem[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "Главная",
    icon: House,
    pathPrefixes: ["/dashboard", "/league", "/board"],
  },
  {
    id: "learning",
    href: "/learning",
    label: "Обучение",
    icon: GraduationCap,
    pathPrefixes: ["/learning", "/tasks", "/monthly-plan", "/courses", "/lessons", "/tests", "/progress"],
  },
  {
    id: "schedule",
    href: "/school-lessons",
    label: "Расписание",
    icon: CalendarDays,
    pathPrefixes: ["/school-lessons", "/online-lessons"],
  },
  {
    id: "messages",
    href: "/messages",
    label: "Сообщения",
    icon: MessagesSquare,
    pathPrefixes: ["/messages"],
    messagesOnly: true,
  },
  {
    id: "shop",
    href: "/rewards",
    label: "Магазин",
    icon: ShoppingBag,
    pathPrefixes: ["/rewards"],
  },
];

export function pathMatchesAny(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const learningPrimaryLinks = [
  { href: "/learning", label: "Сейчас", icon: GraduationCap },
  { href: "/monthly-plan", label: "План", icon: Target },
  { href: "/tasks", label: "Задания", icon: ListTodo },
] as const;

const learningMoreLinks = [
  { href: "/progress", label: "История обучения", icon: History },
  { href: "/courses", label: "Курсы", icon: BookMarked },
  { href: "/tests", label: "Тесты", icon: ClipboardCheck },
] as const;

const learningMorePrefixes = ["/progress", "/courses", "/lessons", "/tests"] as const;

export function StudentWorkspaceContextNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const storefrontUrl = process.env.NEXT_PUBLIC_MAESTRO_SHOP_URL?.trim() || "https://shop.maestro.com.kz";
  const learningSection = pathMatchesAny(pathname, studentWorkspaceNavigation[1].pathPrefixes);
  const shopSection = pathMatchesAny(pathname, studentWorkspaceNavigation[4].pathPrefixes);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  if (learningSection) {
    const moreActive = pathMatchesAny(pathname, learningMorePrefixes);
    return (
      <nav
        aria-label="Разделы обучения"
        data-testid="student-learning-navigation"
        className="relative mb-5 grid grid-cols-4 gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
      >
        {learningPrimaryLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-bold transition sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm ${
                active ? "bg-ink text-white" : "text-stone-500 hover:bg-stone-50 hover:text-ink"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
        <div ref={moreRef} className="relative min-w-0">
          <button
            type="button"
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-current={moreActive ? "page" : undefined}
            className={`flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-bold transition sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-sm ${
              moreActive ? "bg-ink text-white" : "text-stone-500 hover:bg-stone-50 hover:text-ink"
            }`}
          >
            <Ellipsis size={17} className="shrink-0" />
            <span className="truncate">Ещё</span>
          </button>
          {moreOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(17rem,calc(100vw-2rem))] rounded-lg border border-stone-200 bg-white p-1.5 shadow-xl"
            >
              {learningMoreLinks.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                  || (href === "/courses" && pathname.startsWith("/lessons/"));
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                      active ? "bg-amber-50 text-amber-950" : "text-stone-600 hover:bg-stone-50 hover:text-ink"
                    }`}
                  >
                    <Icon size={17} className="shrink-0 text-gold" />
                    {label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>
    );
  }

  if (shopSection) {
    return (
      <nav
        aria-label="Разделы магазина"
        data-testid="student-shop-navigation"
        className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
      >
        <a
          href={storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-bold text-stone-500 transition hover:bg-stone-50 hover:text-ink sm:text-sm"
        >
          <ShoppingBag size={16} className="shrink-0" />
          <span className="truncate">Товары за ₸</span>
          <ExternalLink size={13} className="shrink-0" />
        </a>
        <Link
          href="/rewards"
          aria-current="page"
          className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-ink px-2 text-xs font-bold text-white sm:text-sm"
        >
          <Gift size={16} className="shrink-0" />
          <span className="truncate">За Coins</span>
        </Link>
      </nav>
    );
  }

  return null;
}
