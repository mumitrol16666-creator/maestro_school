"use client";

import {
  AlertCircle,
  ArrowRight,
  Banknote,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  FolderOpen,
  GraduationCap,
  Library,
  MessageCircleQuestion,
  Newspaper,
  RefreshCw,
  Settings,
  UserCog,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminPendingHomeworkBadge } from "@/components/admin-pending-homework-badge";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { usePendingLessonQuestionsCount } from "@/hooks/use-pending-lesson-questions-count";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";
import { usePendingOnlineLessonsCount } from "@/hooks/use-pending-online-lessons-count";
import { adminOverviewApi } from "@/lib/admin-overview-api";
import { useAuth } from "@/components/auth-provider";
import { isContentAdminRole } from "@/lib/role-labels";
import type { ManagementDayLesson } from "@/types/admin-overview";
import { TeacherStaffTasks } from "@/components/teacher-staff-tasks";

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
        <TeacherStaffTasks />
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
  const { count: onlineCount, counts: onlineCounts } = usePendingOnlineLessonsCount();
  const { count: questionsCount } = usePendingLessonQuestionsCount();
  const overview = useApiResource(adminOverviewApi.get, []);
  const [showAllPayments, setShowAllPayments] = useState(false);

  if (overview.loading && !overview.data) {
    return <LoadingState label="Собираем сводку дня" />;
  }

  if (overview.error || !overview.data) {
    return <ErrorState message={overview.error || "Сводка дня пока недоступна"} retry={overview.reload} />;
  }

  const data = overview.data;
  const lessonSummary = data.lessons.summary;
  const remainingLessons = lessonSummary.upcoming + lessonSummary.inProgress;
  const appActions = (count ?? 0)
    + (questionsCount ?? 0)
    + (onlineCounts?.newRequests ?? 0)
    + (onlineCounts?.assignedOrScheduled ?? 0)
    + (onlineCounts?.submissions ?? 0);
  const totalAttention = data.attention.total + appActions;
  const paymentStudents = showAllPayments
    ? data.payments.students
    : data.payments.students.slice(0, 6);
  const attentionItems = [
    {
      label: "Отчёты уроков ждут проверки",
      detail: "Проверить посещаемость и итоги занятия",
      count: data.attention.pendingReview,
      href: "/admin/offline-lessons",
      icon: ClipboardCheck,
    },
    {
      label: "Просрочены отчёты по урокам",
      detail: "Урок закончился, но итог ещё не закрыт",
      count: data.attention.overdueReports,
      href: "/admin/offline-lessons",
      icon: Clock3,
    },
    {
      label: "Новые заявки учеников",
      detail: "Заявки ещё не обработаны",
      count: data.attention.newBookings,
      icon: Users,
    },
    {
      label: "Онлайн-уроки требуют действия",
      detail: "Назначение, проведение или завершение",
      count: (onlineCounts?.newRequests ?? 0) + (onlineCounts?.assignedOrScheduled ?? 0),
      href: "/admin/online-lessons",
      icon: Video,
    },
    {
      label: "Домашние задания на проверке",
      detail: "Работы учеников ожидают решения",
      count: count ?? 0,
      href: "/admin/homework-review",
      icon: ClipboardCheck,
    },
    {
      label: "Вопросы учеников",
      detail: "Нужен ответ от школы",
      count: questionsCount ?? 0,
      href: "/admin/lesson-questions",
      icon: MessageCircleQuestion,
    },
    {
      label: "ДЗ после онлайн-уроков",
      detail: "Работы ждут проверки преподавателем",
      count: onlineCounts?.submissions ?? 0,
      href: "/admin/online-lessons",
      icon: BookOpen,
    },
  ].filter((item) => item.count > 0);
  const dayLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${data.date}T12:00:00`));
  const updatedLabel = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data.generatedAt));

  return (
    <>
      <PageHeader
        eyebrow="Управление школой"
        title="Обзор дня"
        description={`${capitalize(dayLabel)} · обновлено в ${updatedLabel}`}
        action={(
          <button
            type="button"
            onClick={() => void overview.reload()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink sm:w-auto"
          >
            <RefreshCw size={16} />
            Обновить
          </button>
        )}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryMetric
          label="Уроков сегодня"
          value={lessonSummary.total.toLocaleString("ru-RU")}
          detail={`${lessonSummary.completed} завершено`}
          icon={CalendarDays}
          tone="ink"
        />
        <SummaryMetric
          label="Ещё ожидаются"
          value={remainingLessons.toLocaleString("ru-RU")}
          detail={lessonSummary.inProgress ? `${lessonSummary.inProgress} сейчас идут` : "по расписанию"}
          icon={Clock3}
          tone="sky"
        />
        <SummaryMetric
          label="Ожидаемая выручка"
          value={formatMoney(data.payments.expectedRevenueKzt)}
          detail={`${data.payments.count} учеников к оплате`}
          icon={Banknote}
          tone="emerald"
        />
        <SummaryMetric
          label="Требует внимания"
          value={totalAttention.toLocaleString("ru-RU")}
          detail={totalAttention ? "действий и проверок" : "всё спокойно"}
          icon={totalAttention ? AlertCircle : CheckCircle2}
          tone={totalAttention ? "amber" : "emerald"}
        />
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Расписание сегодня"
            detail={`${lessonSummary.upcoming} впереди · ${lessonSummary.pendingReview} на проверке · ${lessonSummary.cancelled} отменено`}
            href="/admin/offline-lessons"
          />
          {data.lessons.items.length ? (
            <div className="space-y-2">
              {data.lessons.items.slice(0, 10).map((lesson) => (
                <LessonRow key={lesson.crmClassId} lesson={lesson} />
              ))}
              {data.lessons.items.length > 10 ? (
                <p className="pt-2 text-center text-xs font-semibold text-stone-400">
                  Ещё уроков: {data.lessons.items.length - 10}
                </p>
              ) : null}
            </div>
          ) : (
            <QuietState title="На сегодня уроков нет" text="Расписание на день свободно." />
          )}
        </section>

        <section className="min-w-0">
          <SectionHeading
            title="Требует внимания"
            detail={attentionItems.length ? "Сначала критичные действия" : "Незакрытых действий нет"}
          />
          {attentionItems.length ? (
            <div className="space-y-2">
              {attentionItems.map((item) => (
                <AttentionRow key={item.label} {...item} />
              ))}
            </div>
          ) : (
            <QuietState title="Всё под контролем" text="На сейчас срочных действий нет." success />
          )}
        </section>
      </div>

      <section className="mt-10 border-t border-stone-200 pt-9">
        <SectionHeading
          title="Ожидаются оплаты"
          detail={`Активные ученики с балансом ниже ${formatMoney(data.payments.thresholdKzt)}`}
        />
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-display text-3xl text-emerald-800">
              {formatMoney(data.payments.expectedRevenueKzt)}
            </p>
            <p className="mt-1 text-xs font-semibold text-stone-400">
              минимальное пополнение балансов до {formatMoney(data.payments.thresholdKzt)}
            </p>
          </div>
          {data.payments.debtCount > 0 ? (
            <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
              С долгом: {data.payments.debtCount}
            </span>
          ) : null}
        </div>
        {paymentStudents.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {paymentStudents.map((student) => (
              <div
                key={student.crmStudentId}
                className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{student.name}</p>
                  <p className="mt-1 truncate text-xs text-stone-400">
                    {student.direction || student.planName || "Обучение"} · баланс {formatMoney(student.accountBalanceKzt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-emerald-800">+{formatMoney(student.expectedTopUpKzt)}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase text-stone-400">к пополнению</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <QuietState title="Оплаты не ожидаются" text="У всех активных учеников достаточный баланс." success />
        )}
        {data.payments.students.length > 6 ? (
          <button
            type="button"
            onClick={() => setShowAllPayments((value) => !value)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink"
          >
            {showAllPayments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showAllPayments ? "Свернуть" : `Показать ещё ${data.payments.students.length - 6}`}
          </button>
        ) : null}
        {data.payments.count > data.payments.students.length ? (
          <p className="mt-3 text-center text-xs font-semibold text-stone-400">
            В сводке показано {data.payments.students.length} из {data.payments.count} учеников
          </p>
        ) : null}
      </section>

      <section className="mt-10 border-t border-stone-200 pt-9">
        <SectionHeading title="Разделы управления" detail="Учебные материалы, пользователи и процессы" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map(({ href, title, text, icon: Icon, showPending, showOnlinePending }) => {
          const pending = showOnlinePending ? onlineCount : showPending ? count : null;
          return (
          <Link key={href} href={href} className="card-hover min-w-0 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-gold">
                <Icon size={18} />
              </span>
              {pending != null && pending > 0 && <AdminPendingHomeworkBadge count={pending} />}
            </div>
            <h2 className="font-display mt-5 text-xl">{title}</h2>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">{text}</p>
          </Link>
          );
        })}
        </div>
      </section>
    </>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CalendarDays;
  tone: "ink" | "sky" | "emerald" | "amber";
}) {
  const tones = {
    ink: "border-stone-800 bg-ink text-white",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  };
  const iconTones = {
    ink: "bg-white/10 text-gold",
    sky: "bg-white text-sky-700",
    emerald: "bg-white text-emerald-700",
    amber: "bg-white text-amber-700",
  };

  return (
    <article className={`min-w-0 rounded-[24px] border p-4 sm:p-5 ${tones[tone]}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconTones[tone]}`}>
        <Icon size={17} />
      </span>
      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.12em] opacity-60 sm:text-xs">{label}</p>
      <p className="mt-1 break-words font-display text-2xl leading-tight sm:text-3xl">{value}</p>
      <p className="mt-2 text-[11px] font-semibold opacity-60 sm:text-xs">{detail}</p>
    </article>
  );
}

function SectionHeading({
  title,
  detail,
  href,
}: {
  title: string;
  detail: string;
  href?: string;
}) {
  return (
    <div className="mb-4 flex min-w-0 items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
        <p className="mt-1 text-xs font-semibold text-stone-400">{detail}</p>
      </div>
      {href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-gold">
          Все <ArrowRight size={14} />
        </Link>
      ) : null}
    </div>
  );
}

function lessonStatus(lesson: ManagementDayLesson) {
  if (lesson.teacherOutcomeHint === "not_held") {
    return { label: "Не состоялся", className: "bg-red-50 text-red-700" };
  }
  const statuses: Record<string, { label: string; className: string }> = {
    scheduled: { label: "Запланирован", className: "bg-sky-50 text-sky-800" },
    started: { label: "Идёт", className: "bg-emerald-100 text-emerald-800" },
    pending_admin_review: { label: "На проверке", className: "bg-amber-100 text-amber-900" },
    completed: { label: "Завершён", className: "bg-emerald-50 text-emerald-700" },
    cancelled: { label: "Отменён", className: "bg-stone-100 text-stone-500" },
    not_filled: { label: "Нужен отчёт", className: "bg-red-50 text-red-700" },
  };
  return statuses[lesson.status] || { label: lesson.status, className: "bg-stone-100 text-stone-600" };
}

function LessonRow({ lesson }: { lesson: ManagementDayLesson }) {
  const status = lessonStatus(lesson);
  return (
    <Link
      href={`/admin/offline-lessons/${lesson.crmClassId}`}
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 transition hover:border-gold/50 sm:p-4"
    >
      <span className="w-12 shrink-0 text-center font-display text-lg text-ink">{lesson.startTime}</span>
      <span className="h-9 w-px shrink-0 bg-stone-200" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{lesson.audienceName || lesson.title}</p>
        <p className="mt-1 truncate text-xs text-stone-400">
          {lesson.teacher?.name || "Преподаватель не назначен"}
          {lesson.room?.name ? ` · ${lesson.room.name}` : ""}
        </p>
      </div>
      <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${status.className}`}>
        {status.label}
      </span>
      <ArrowRight size={15} className="shrink-0 text-stone-300" />
    </Link>
  );
}

function AttentionRow({
  label,
  detail,
  count,
  href,
  icon: Icon,
}: {
  label: string;
  detail: string;
  count: number;
  href?: string;
  icon: typeof CalendarDays;
}) {
  const content = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="mt-1 text-xs leading-5 text-stone-400">{detail}</p>
      </div>
      <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-ink px-2 text-xs font-black text-white">
        {count}
      </span>
      {href ? <ArrowRight size={15} className="shrink-0 text-stone-300" /> : null}
    </>
  );

  return href ? (
    <Link href={href} className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 transition hover:border-gold/50">
      {content}
    </Link>
  ) : (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3">
      {content}
    </div>
  );
}

function QuietState({
  title,
  text,
  success = false,
}: {
  title: string;
  text: string;
  success?: boolean;
}) {
  const Icon = success ? CheckCircle2 : CalendarDays;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
        success ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
      }`}>
        <Icon size={17} />
      </span>
      <div>
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="mt-1 text-xs text-stone-400">{text}</p>
      </div>
    </div>
  );
}
