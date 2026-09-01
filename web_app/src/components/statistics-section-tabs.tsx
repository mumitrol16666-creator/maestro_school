"use client";

import { Activity, BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/statistics", label: "Использование", icon: Activity },
  { href: "/admin/statistics/homework", label: "Домашние задания", icon: BookOpenCheck },
];

export function StatisticsSectionTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-7 grid grid-cols-2 gap-1 rounded-lg border border-stone-200 bg-white p-1" aria-label="Разделы статистики">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-bold transition sm:text-sm ${
              active ? "bg-ink text-white" : "text-stone-500 hover:bg-stone-50 hover:text-ink"
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
