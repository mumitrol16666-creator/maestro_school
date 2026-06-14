"use client";

import { CalendarDays, CheckCircle2, Clock3, MapPin, Ticket, UserRound, XCircle } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { SchoolOfflineLesson } from "@/types/school-offline";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  not_filled: "Не заполнен",
  cancelled: "Отменён",
};

const membershipTypeLabels: Record<string, string> = {
  trial: "Пробный",
  monthly: "Месячный",
  monthly_12: "12 занятий",
  quarterly: "Квартальный",
  individual_single: "Индивидуальный",
  individual_package: "Пакет индивид.",
  single_class: "Разовое",
  custom: "Индивидуальный",
};

function formatLessonDate(dateStr: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateStr));
}

function LessonCard({ lesson, upcoming }: { lesson: SchoolOfflineLesson; upcoming?: boolean }) {
  const statusLabel = statusLabels[lesson.status] ?? lesson.status;

  return (
    <article
      className={`rounded-[24px] border p-5 shadow-soft ${
        upcoming ? "border-gold/20 bg-white" : "border-stone-200 bg-paper"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">{lesson.title}</h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} className="text-gold" />
              {formatLessonDate(lesson.date)} · {lesson.startTime}–{lesson.endTime}
            </span>
            {lesson.teacherName ? (
              <span className="inline-flex items-center gap-1.5">
                <UserRound size={14} />
                {lesson.teacherName}
              </span>
            ) : null}
            {lesson.roomName ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} />
                {lesson.roomName}
              </span>
            ) : null}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
            lesson.status === "completed"
              ? "bg-emerald-50 text-emerald-800"
              : lesson.status === "pending_admin_review"
                ? "bg-amber-50 text-amber-900"
                : "bg-stone-100 text-stone-600"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {lesson.groupName ? (
        <p className="mt-3 text-xs font-semibold text-stone-400">Группа: {lesson.groupName}</p>
      ) : null}

      {!upcoming && lesson.attended != null ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">
          {lesson.attended ? (
            <>
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span className="text-emerald-800">Присутствовал</span>
            </>
          ) : (
            <>
              <XCircle size={16} className="text-stone-400" />
              <span className="text-stone-500">Не был на уроке</span>
            </>
          )}
        </p>
      ) : null}

      {lesson.topic ? (
        <div className="mt-4 rounded-2xl bg-stone-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Тема урока</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">{lesson.topic}</p>
        </div>
      ) : null}

      {lesson.homework ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Домашнее задание</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{lesson.homework}</p>
        </div>
      ) : null}
    </article>
  );
}

export default function SchoolLessonsPage() {
  const resource = useApiResource(() => api.studentOfflineSummary(), []);

  if (resource.loading) {
    return <LoadingState label="Загружаем расписание школы" />;
  }

  if (resource.error) {
    if (resource.errorCode === "CRM_NOT_LINKED") {
      return (
        <>
          <PageHeader
            eyebrow="Офлайн-школа"
            title="Уроки в школе"
            description="Расписание, абонементы и домашние задания с занятий в студии Maestro."
          />
          <EmptyState
            title="Профиль школы не подключён"
            description="Ваш аккаунт в приложении пока не связан с CRM школы. Обратитесь к администратору — после привязки здесь появятся уроки и остаток абонемента."
          />
        </>
      );
    }
    return <ErrorState message={resource.error} retry={resource.reload} />;
  }

  const data = resource.data;
  if (!data) {
    return <ErrorState message="Не удалось загрузить данные" retry={resource.reload} />;
  }

  const { balanceSnapshot, upcomingLessons, lessonHistory, profile } = data;

  return (
    <>
      <PageHeader
        eyebrow="Офлайн-школа"
        title="Уроки в школе"
        description="Расписание занятий в студии, остаток абонемента и домашние задания после подтверждения урока администратором."
      />

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <Ticket className="text-gold" size={22} />
          <p className="font-display mt-4 text-4xl">{balanceSnapshot.classesRemainingTotal}</p>
          <p className="mt-1 text-sm text-stone-500">занятий осталось</p>
        </div>
        {balanceSnapshot.debtAmountKzt > 0 ? (
          <div className="rounded-[28px] border border-red-100 bg-red-50 p-6 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">Долг</p>
            <p className="font-display mt-4 text-4xl text-red-900">
              {balanceSnapshot.debtAmountKzt.toLocaleString("ru-RU")} ₸
            </p>
            <p className="mt-1 text-sm text-red-700/80">по активным абонементам</p>
          </div>
        ) : (
          <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-6 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Оплата</p>
            <p className="font-display mt-4 text-3xl text-emerald-900">Без долга</p>
            <p className="mt-1 text-sm text-emerald-800/80">по активным абонементам</p>
          </div>
        )}
        {profile.groups.length > 0 ? (
          <div className="rounded-[28px] border border-stone-200 bg-ink p-6 text-white shadow-soft sm:col-span-2 xl:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Группы</p>
            <p className="mt-4 text-sm leading-7 text-white/80">
              {profile.groups.map((g) => g.name).join(" · ")}
            </p>
          </div>
        ) : null}
      </section>

      {balanceSnapshot.memberships.length > 0 ? (
        <section className="mb-10 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Абонементы</p>
          <h2 className="font-display mt-3 text-3xl">Активные пакеты</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balanceSnapshot.memberships.map((m) => (
              <div key={m.crmMembershipId} className="rounded-2xl border border-stone-200 bg-white p-5">
                <p className="font-display text-4xl text-ink">{m.classesRemaining}</p>
                <p className="mt-2 text-sm font-semibold text-stone-700">
                  {m.groupName} · {membershipTypeLabels[m.type] ?? m.type}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  из {m.totalClasses} до {formatLessonDate(m.endDate)}
                </p>
                {m.remainingAmountKzt > 0 ? (
                  <p className="mt-3 text-xs font-bold text-red-700">
                    Долг: {m.remainingAmountKzt.toLocaleString("ru-RU")} ₸
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-10">
        <div className="mb-5 flex items-center gap-3">
          <Clock3 className="text-gold" size={22} />
          <h2 className="font-display text-3xl">Ближайшие уроки</h2>
        </div>
        {upcomingLessons.length === 0 ? (
          <EmptyState title="Ближайших уроков нет" description="Когда администратор добавит занятия в расписание, они появятся здесь." />
        ) : (
          <div className="space-y-4">
            {upcomingLessons.map((lesson) => (
              <LessonCard key={lesson.crmClassId} lesson={lesson} upcoming />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display mb-5 text-3xl">История уроков</h2>
        {lessonHistory.length === 0 ? (
          <EmptyState title="История пуста" description="После проведённых занятий здесь появятся темы и домашние задания." />
        ) : (
          <div className="space-y-4">
            {lessonHistory.map((lesson) => (
              <LessonCard key={lesson.crmClassId} lesson={lesson} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
