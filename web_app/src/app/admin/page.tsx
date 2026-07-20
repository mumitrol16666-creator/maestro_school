"use client";

import { BookOpen, CalendarDays, ClipboardCheck, FolderOpen, GraduationCap, Library, Newspaper, Settings, UserCog, Users, Video } from "lucide-react";
import Link from "next/link";
import { AdminPendingHomeworkBadge } from "@/components/admin-pending-homework-badge";
import { AdminPendingHomeworkBanner } from "@/components/admin-pending-homework-banner";
import { PageHeader } from "@/components/page-header";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";
import { usePendingOnlineLessonsCount } from "@/hooks/use-pending-online-lessons-count";
import { useAuth } from "@/components/auth-provider";
import { isContentAdminRole } from "@/lib/role-labels";

const sections = [
  { href: "/admin/directions", title: "Направления", text: "Создание и публикация направлений школы", icon: FolderOpen },
  { href: "/admin/courses", title: "Курсы и уроки", text: "Модули, уроки, материалы и домашние задания", icon: BookOpen },
  { href: "/admin/students", title: "Ученики", text: "Баллы, уроки, достижения и контакты учеников", icon: Users },
  { href: "/admin/users", title: "Пользователи и роли", text: "Назначение ролей: преподаватель, администратор, ученик", icon: UserCog },
  { href: "/admin/online-lessons", title: "Онлайн-уроки", text: "Заявки на живые уроки в Zoom", icon: Video, showOnlinePending: true },
  { href: "/admin/homework-review", title: "Проверка ДЗ", text: "Очередь работ учеников на проверку", icon: ClipboardCheck, showPending: true },
  { href: "/admin/news", title: "Доска Maestro", text: "Новости, объявления и мероприятия", icon: Newspaper },
  { href: "/admin/media", title: "Медиатека", text: "Изображения, PDF и другие файлы", icon: Library },
];

export default function AdminPage() {
  const { user } = useAuth();
  const isContentAdmin = isContentAdminRole(user?.role);

  if (!isContentAdmin) {
    const teacherSections = [
      {
        href: "/admin/offline-lessons",
        title: "Мои офлайн-уроки",
        text: "Сегодняшнее расписание, отчёты, посещаемость и статусы подтверждения.",
        icon: CalendarDays,
        accent: "bg-amber-50 text-amber-900",
      },
      {
        href: "/admin/my-students",
        title: "Мои ученики",
        text: "Контакты, расписание, абонементы и история посещаемости.",
        icon: Users,
        accent: "bg-emerald-50 text-emerald-800",
      },
      {
        href: "/admin/online-lessons",
        title: "Онлайн-уроки",
        text: "Назначенные занятия, ссылки на встречу и завершение уроков.",
        icon: Video,
        accent: "bg-sky-50 text-sky-800",
      },
      {
        href: "/admin/settings",
        title: "Настройки",
        text: "Профиль преподавателя, безопасность аккаунта и уведомления.",
        icon: Settings,
        accent: "bg-stone-100 text-stone-700",
      },
    ];

    return (
      <>
        <PageHeader
          eyebrow="Кабинет преподавателя"
          title="Главная"
          description="Всё необходимое для рабочего дня преподавателя — без лишних административных разделов."
        />
        <div className="mb-6 rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-soft">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold">
              <GraduationCap size={22} />
            </span>
            <div>
              <h2 className="font-display text-2xl">Начните с расписания на сегодня</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                После урока отметьте посещаемость, заполните отчёт и отправьте его администратору.
              </p>
              <Link href="/admin/offline-lessons" className="mt-4 inline-flex rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white transition hover:bg-stone-800">
                Открыть мои уроки
              </Link>
            </div>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {teacherSections.map(({ href, title, text, icon: Icon, accent }) => (
            <Link key={href} href={href} className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${accent}`}>
                <Icon size={20} />
              </span>
              <h2 className="font-display mt-6 text-3xl">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-stone-500">{text}</p>
              <span className="mt-5 inline-flex text-xs font-black uppercase tracking-wide text-gold">Открыть →</span>
            </Link>
          ))}
        </div>
      </>
    );
  }

  return <ContentAdminDashboard />;
}

function ContentAdminDashboard() {
  const { count } = usePendingHomeworkCount();
  const { count: onlineCount } = usePendingOnlineLessonsCount();

  return (
    <>
      <PageHeader
        eyebrow="Управление школой"
        title="Управление обучением"
        description="Курсы, материалы, ученики и учебные процессы в одном месте."
      />
      <AdminPendingHomeworkBanner />
      <div className="grid gap-5 md:grid-cols-2">
        {sections.map(({ href, title, text, icon: Icon, showPending, showOnlinePending }) => {
          const pending = showOnlinePending ? onlineCount : showPending ? count : null;
          return (
          <Link key={href} href={href} className="card-hover rounded-[28px] border border-stone-200 bg-paper p-7 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-gold">
                <Icon size={20} />
              </span>
              {pending != null && pending > 0 && <AdminPendingHomeworkBadge count={pending} />}
            </div>
            <h2 className="font-display mt-8 text-3xl">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">{text}</p>
            {pending != null && pending > 0 && (
              <p className="mt-4 text-xs font-bold text-amber-700">
                {showOnlinePending
                  ? (pending === 1 ? "1 заявка ждёт обработки" : `${pending} заявок ждут обработки`)
                  : (pending === 1 ? "1 работа на проверке" : `${pending} работ на проверке`)}
              </p>
            )}
          </Link>
          );
        })}
      </div>
    </>
  );
}
