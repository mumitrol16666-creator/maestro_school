"use client";

import { ArrowRight, CalendarDays, GraduationCap } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { isContentAdminRole } from "@/lib/role-labels";
import { teacherOfflineApi } from "@/lib/teacher-offline-api";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  not_filled: "Не заполнен",
  cancelled: "Отменён",
};

const statusClasses: Record<string, string> = {
  scheduled: "bg-sky-50 text-sky-900",
  started: "bg-emerald-50 text-emerald-900",
  pending_admin_review: "bg-amber-50 text-amber-900",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-red-50 text-red-800",
};

function formatLessonDate(dateStr: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(dateStr));
}

export default function AdminOfflineLessonsPage() {
  const { user } = useAuth();
  const resource = useApiResource(() => teacherOfflineApi.agenda(), []);

  if (resource.loading) return <LoadingState label="Загружаем расписание школы" />;

  if (resource.errorCode === "CRM_NOT_LINKED") {
    const isAdmin = isContentAdminRole(user?.role);

    return (
      <>
        <PageHeader
          eyebrow="Офлайн-школа"
          title="Офлайн-уроки"
          description="Ваши занятия в студии Maestro: посещаемость, тема и домашнее задание."
        />
        <EmptyState
          title="CRM-профиль не подключён"
          description={
            isAdmin
              ? "Этот раздел показывает расписание конкретного преподавателя из CRM. Аккаунт администратора CMS (admin@…) не привязан к карточке преподавателя. Откройте пользователя с ролью «Преподаватель», в блоке «Связь с CRM» привяжите его по телефону — затем войдите под этим преподавателем или откройте платформу из CRM."
              : "Ваш аккаунт не связан с преподавателем в CRM. Попросите администратора: «Пользователи» → ваш профиль → «Связь с CRM» → привязка по телефону. Телефон в LP и CRM должен совпадать."
          }
          action={
            isAdmin ? (
              <Link
                href="/admin/users?role=teacher"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"
              >
                Открыть преподавателей <ArrowRight size={15} />
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;

  const classes = resource.data?.classes ?? [];
  const todayKey = new Date().toDateString();
  const todayClasses = classes.filter((item) => new Date(item.date).toDateString() === todayKey);
  const upcomingClasses = classes.filter((item) => new Date(item.date) > new Date(todayKey + " 23:59:59"));

  return (
    <>
      <PageHeader
        eyebrow="Офлайн-школа"
        title="Офлайн-уроки"
        description="Расписание занятий в студии. Отмечайте посещаемость, заполняйте тему и ДЗ, отправляйте урок на подтверждение администратору."
      />

      <section className="mb-8 rounded-[28px] border border-gold/20 bg-ink p-6 text-white shadow-soft sm:p-8">
        <div className="flex items-center gap-3">
          <GraduationCap className="text-gold" size={24} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Сегодня</p>
            <h2 className="font-display text-3xl">{todayClasses.length} занятий</h2>
          </div>
        </div>
      </section>

      {todayClasses.length > 0 ? (
        <section className="mb-10">
          <h2 className="font-display mb-5 text-3xl">Уроки на сегодня</h2>
          <div className="space-y-3">
            {todayClasses.map((lesson) => (
              <LessonRow key={lesson.crmClassId} lesson={lesson} highlight />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="font-display mb-5 text-3xl">
          {todayClasses.length ? "Ближайшие" : "Расписание"}
        </h2>
        {(todayClasses.length ? upcomingClasses : classes).length === 0 ? (
          <EmptyState
            title="Уроков пока нет"
            description="Когда администратор назначит вам занятия в CRM, они появятся здесь."
          />
        ) : (
          <div className="space-y-3">
            {(todayClasses.length ? upcomingClasses : classes).map((lesson) => (
              <LessonRow key={lesson.crmClassId} lesson={lesson} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function LessonRow({
  lesson,
  highlight,
}: {
  lesson: {
    crmClassId: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    group?: { name: string } | null;
    room?: { name: string } | null;
  };
  highlight?: boolean;
}) {
  return (
    <Link
      href={`/admin/offline-lessons/${lesson.crmClassId}`}
      className={`card-hover flex flex-col gap-4 rounded-[24px] border p-5 shadow-soft sm:flex-row sm:items-center ${
        highlight ? "border-gold/25 bg-white" : "border-stone-200 bg-paper"
      }`}
    >
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
          {formatLessonDate(lesson.date)} · {lesson.startTime}–{lesson.endTime}
        </p>
        <h3 className="font-display mt-2 text-2xl">{lesson.title}</h3>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={14} />
            {lesson.group?.name ?? "Индивидуальный урок"}
          </span>
          {lesson.room?.name ? <span>Кабинет: {lesson.room.name}</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${statusClasses[lesson.status] ?? "bg-stone-100 text-stone-600"}`}>
          {statusLabels[lesson.status] ?? lesson.status}
        </span>
        <ArrowRight size={18} className="text-gold" />
      </div>
    </Link>
  );
}
