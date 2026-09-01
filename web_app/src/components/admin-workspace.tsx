"use client";

import {
  BookMarked,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileQuestion,
  FolderKanban,
  Gift,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  Megaphone,
  MessageCircleQuestion,
  MessagesSquare,
  Trophy,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";
import { usePendingLessonQuestionsCount } from "@/hooks/use-pending-lesson-questions-count";
import { homePathForRole, isContentAdminRole } from "@/lib/role-labels";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";
import { useAuth } from "./auth-provider";
import { LoadingState } from "./data-states";
import { PageHeader } from "./page-header";

export type AdminWorkspaceSectionId = "overview" | "statistics" | "learning" | "communications" | "people" | "journal";

type BadgeKind = "homework" | "questions";

type AdminWorkspaceItem = {
  href: string;
  label: string;
  description: string;
  group: string;
  icon: LucideIcon;
  badge?: BadgeKind;
};

export type AdminWorkspaceSection = {
  id: AdminWorkspaceSectionId;
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  pathPrefixes: string[];
  items: AdminWorkspaceItem[];
};

export const adminWorkspaceSections: AdminWorkspaceSection[] = [
  {
    id: "overview",
    href: "/admin",
    label: "Обзор",
    eyebrow: "Управление школой",
    description: "Сводка дня, риски, оплаты и приоритетные действия.",
    icon: LayoutDashboard,
    pathPrefixes: [],
    items: [],
  },
  {
    id: "statistics",
    href: "/admin/statistics",
    label: "Статистика",
    eyebrow: "Работа приложения",
    description: "Входы учеников, домашние задания, тесты и сравнение активности по месяцам.",
    icon: BarChart3,
    pathPrefixes: ["/admin/statistics"],
    items: [],
  },
  {
    id: "learning",
    href: "/admin/learning",
    label: "Учебный контроль",
    eyebrow: "Учебный контроль",
    description: "Уроки, проверки, программы, материалы и система мотивации.",
    icon: GraduationCap,
    pathPrefixes: [
      "/admin/learning",
      "/admin/offline-lessons",
      "/admin/online-lessons",
      "/admin/homework-review",
      "/admin/directions",
      "/admin/courses",
      "/admin/tests",
      "/admin/media",
      "/admin/league",
      "/admin/rewards",
    ],
    items: [
      {
        href: "/admin/offline-lessons",
        label: "Уроки",
        description: "Единое расписание занятий в школе и онлайн, посещаемость, отчёты и подтверждение.",
        group: "Рабочий день",
        icon: CalendarDays,
      },
      {
        href: "/admin/homework-review",
        label: "Проверка домашних заданий",
        description: "Единая очередь работ, ожидающих решения преподавателя или администратора.",
        group: "Рабочий день",
        icon: ClipboardCheck,
        badge: "homework",
      },
      {
        href: "/admin/directions",
        label: "Направления",
        description: "Направления обучения, доступные в Maestro.",
        group: "Программы и контент",
        icon: FolderKanban,
      },
      {
        href: "/admin/courses",
        label: "Курсы",
        description: "Структура курсов, уроки и связанные учебные материалы.",
        group: "Программы и контент",
        icon: BookMarked,
      },
      {
        href: "/admin/tests",
        label: "Тесты",
        description: "Банк тестов, публикация и предварительный просмотр.",
        group: "Программы и контент",
        icon: FileQuestion,
      },
      {
        href: "/admin/media",
        label: "Медиатека",
        description: "Изображения, PDF и материалы для учебного контента.",
        group: "Программы и контент",
        icon: LibraryBig,
      },
      {
        href: "/admin/league",
        label: "Недельная лига",
        description: "Текущая неделя, итоговые позиции и история соревнований.",
        group: "Мотивация",
        icon: Trophy,
      },
      {
        href: "/admin/rewards",
        label: "Награды",
        description: "Каталог наград, заявки учеников и ручное выполнение.",
        group: "Мотивация",
        icon: Gift,
      },
    ],
  },
  {
    id: "communications",
    href: "/admin/communications",
    label: "Коммуникации",
    eyebrow: "Коммуникации",
    description: "Сообщения, вопросы учеников и новости школы в одном разделе.",
    icon: MessagesSquare,
    pathPrefixes: ["/admin/communications", "/admin/lesson-questions", "/admin/news"],
    items: [
      {
        href: "/admin/lesson-questions",
        label: "Вопросы учеников",
        description: "Открытые вопросы по урокам и история обработанных обращений.",
        group: "Обращения",
        icon: MessageCircleQuestion,
        badge: "questions",
      },
      {
        href: "/admin/news",
        label: "Новости школы",
        description: "Публикации для учеников и родителей с раздельными аудиториями.",
        group: "Публикации",
        icon: Megaphone,
      },
    ],
  },
  {
    id: "people",
    href: "/admin/people",
    label: "Люди",
    eyebrow: "Люди и доступы",
    description: "Ученики, семьи, сотрудники, учётные записи и роли.",
    icon: UsersRound,
    pathPrefixes: ["/admin/people", "/admin/students", "/admin/users", "/admin/my-students"],
    items: [
      {
        href: "/admin/students",
        label: "Ученики и семьи",
        description: "Учебные карточки, прогресс, родители и настройки семейного доступа.",
        group: "Ученики",
        icon: UsersRound,
      },
      {
        href: "/admin/users",
        label: "Учётные записи и роли",
        description: "Сотрудники, родители, статусы аккаунтов и административные права.",
        group: "Доступы",
        icon: UserCog,
      },
    ],
  },
  {
    id: "journal",
    href: "/admin/journal",
    label: "Журнал",
    eyebrow: "Контроль процессов",
    description: "Ошибки, зависшие процессы, корректировки и история принятых решений.",
    icon: ListChecks,
    pathPrefixes: ["/admin/journal"],
    items: [],
  },
];

export function isAdminWorkspaceSectionActive(section: AdminWorkspaceSection, pathname: string) {
  if (section.id === "overview") return pathname === "/admin";
  return section.pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AdminWorkspaceDirectory() {
  const sections = adminWorkspaceSections.filter((section) => section.id !== "overview");

  return (
    <section className="mt-10 border-t border-stone-200 pt-8" data-testid="admin-workspace-directory">
      <div className="mb-4">
        <h2 className="font-display text-2xl sm:text-3xl">Рабочие разделы</h2>
        <p className="mt-1 text-sm text-stone-500">Учебные процессы, коммуникации, люди и контроль решений.</p>
      </div>
      <div className="divide-y divide-stone-200 border-y border-stone-200">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.id}
              href={section.href}
              className="group grid min-h-20 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 py-4 transition hover:bg-white/60 sm:px-3"
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink text-gold">
                <Icon size={19} />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm text-ink sm:text-base">{section.label}</strong>
                <span className="mt-1 block text-xs leading-5 text-stone-500 sm:text-sm">{section.description}</span>
              </span>
              <ChevronRight size={18} className="text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-gold" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function AdminWorkspaceHub({ sectionId }: { sectionId: Exclude<AdminWorkspaceSectionId, "overview" | "statistics" | "journal"> }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const enabled = !!user?.productFeatures?.curatorWorkspaceV2 && isContentAdminRole(user.role);
  const { count: homeworkCount } = usePendingHomeworkCount(60_000, enabled);
  const { count: questionsCount } = usePendingLessonQuestionsCount(60_000, enabled);
  const section = adminWorkspaceSections.find((item) => item.id === sectionId);

  useEffect(() => {
    if (loading || enabled) return;
    router.replace(homePathForRole(user?.role));
  }, [enabled, loading, router, user?.role]);

  if (!section || loading || !enabled) {
    return <LoadingState label="Открываем раздел" />;
  }

  const counts: Record<BadgeKind, number | null> = {
    homework: homeworkCount,
    questions: questionsCount,
  };
  const groups = [...new Set(section.items.map((item) => item.group))];

  return (
    <div data-testid={`admin-workspace-${section.id}`}>
      <PageHeader eyebrow={section.eyebrow} title={section.label} description={section.description} />
      <div className="space-y-9">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="mb-3 text-sm font-black text-stone-500">{group}</h2>
            <div className="divide-y divide-stone-200 border-y border-stone-200">
              {section.items.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const pending = item.badge ? counts[item.badge] : null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group grid min-h-20 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 py-4 transition hover:bg-white/60 sm:px-3"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 transition group-hover:border-gold/40 group-hover:text-gold">
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <strong className="text-sm text-ink sm:text-base">{item.label}</strong>
                        {pending != null && pending > 0 ? <AdminPendingHomeworkBadge count={pending} /> : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-stone-500 sm:text-sm">{item.description}</span>
                    </span>
                    <ChevronRight size={18} className="text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-gold" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
