"use client";

import { BookOpen, ClipboardCheck, FolderOpen, Library, Newspaper } from "lucide-react";
import Link from "next/link";
import { AdminPendingHomeworkBadge } from "@/components/admin-pending-homework-badge";
import { AdminPendingHomeworkBanner } from "@/components/admin-pending-homework-banner";
import { PageHeader } from "@/components/page-header";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";

const sections = [
  { href: "/admin/directions", title: "Направления", text: "Создание и публикация направлений школы", icon: FolderOpen },
  { href: "/admin/courses", title: "Курсы и уроки", text: "Модули, уроки, материалы и домашние задания", icon: BookOpen },
  { href: "/admin/homework-review", title: "Проверка ДЗ", text: "Очередь работ учеников на проверку", icon: ClipboardCheck, showPending: true },
  { href: "/admin/news", title: "Доска Maestro", text: "Новости, объявления и мероприятия", icon: Newspaper },
  { href: "/admin/media", title: "Медиатека", text: "Изображения, PDF и другие файлы", icon: Library },
];

export default function AdminPage() {
  const { count } = usePendingHomeworkCount();

  return (
    <>
      <PageHeader
        eyebrow="Content CMS"
        title="Управление обучением"
        description="Создавайте и публикуйте образовательный контент Maestro без участия разработчика."
      />
      <AdminPendingHomeworkBanner />
      <div className="grid gap-5 md:grid-cols-2">
        {sections.map(({ href, title, text, icon: Icon, showPending }) => (
          <Link key={href} href={href} className="card-hover rounded-[28px] border border-stone-200 bg-paper p-7 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-gold">
                <Icon size={20} />
              </span>
              {showPending && count != null && count > 0 && <AdminPendingHomeworkBadge count={count} />}
            </div>
            <h2 className="font-display mt-8 text-3xl">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">{text}</p>
            {showPending && count != null && count > 0 && (
              <p className="mt-4 text-xs font-bold text-amber-700">
                {count === 1 ? "1 работа на проверке" : `${count} работ на проверке`}
              </p>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
