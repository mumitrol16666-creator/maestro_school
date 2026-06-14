"use client";

import { CalendarDays, CheckCircle2, Clock3, Download, MapPin, Ticket, UserRound, WalletCards, XCircle } from "lucide-react";
import { useState } from "react";
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

      {!upcoming && lesson.status === "completed" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <LessonReportField label="Цели урока" value={lesson.lessonGoals} />
          <LessonReportField label="Что сделали" value={lesson.lessonSummary} />
          <LessonReportField label="Что доработать дальше" value={lesson.nextLessonFocus} />
        </div>
      )}

      {lesson.homework ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Домашнее задание</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{lesson.homework}</p>
        </div>
      ) : null}

      {!upcoming && lesson.materials.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Материалы урока</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {lesson.materials.map((material, index) => material.url ? (
              <a
                key={`${material.url}-${index}`}
                href={material.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
              >
                {material.title || `Материал ${index + 1}`}
              </a>
            ) : null)}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function LessonReportField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{value}</p>
    </div>
  );
}

export default function SchoolLessonsPage() {
  const resource = useApiResource(() => api.studentOfflineSummary(), []);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

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

  const { balanceSnapshot, upcomingLessons, lessonHistory } = data;
  const currentMembership = balanceSnapshot.currentMembership;

  function downloadMonthlyReport() {
    const lessons = lessonHistory.filter((lesson) => (
      lesson.status === "completed" && lesson.date.slice(0, 7) === reportMonth
    ));
    const rows = [
      ["Дата", "Урок", "Преподаватель", "Тема", "Цели", "Что сделали", "Что доработать", "Домашнее задание"],
      ...lessons.map((lesson) => [
        formatLessonDate(lesson.date),
        lesson.title,
        lesson.teacherName || "",
        lesson.topic || "",
        lesson.lessonGoals || "",
        lesson.lessonSummary || "",
        lesson.nextLessonFocus || "",
        lesson.homework || "",
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `maestro-report-${reportMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

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
          <p className="font-display mt-4 text-4xl">{currentMembership?.classesRemaining ?? 0}</p>
          <p className="mt-1 text-sm text-stone-500">занятий в текущем абонементе</p>
        </div>
        <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <WalletCards className="text-gold" size={22} />
          <p className="font-display mt-4 text-3xl">
            {balanceSnapshot.totalPaidAmountKzt.toLocaleString("ru-RU")} ₸
          </p>
          <p className="mt-1 text-sm text-stone-500">оплачено по активным абонементам</p>
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
      </section>

      {currentMembership ? (
        <section className="mb-8 rounded-[28px] border border-gold/20 bg-ink p-6 text-white shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Текущий абонемент</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h2 className="font-display text-3xl">{currentMembership.planName || membershipTypeLabels[currentMembership.type] || currentMembership.type}</h2>
              <p className="mt-2 text-sm text-white/65">
                {[currentMembership.directionName, currentMembership.groupName, currentMembership.teacherName].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-4xl text-gold">{currentMembership.classesRemaining} из {currentMembership.totalClasses}</p>
              <p className="mt-1 text-xs text-white/50">до {formatLessonDate(currentMembership.endDate)}</p>
            </div>
          </div>
        </section>
      ) : null}

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
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Подтверждено администратором</p>
            <h2 className="font-display mt-2 text-3xl">История и отчёты по урокам</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={reportMonth}
              onChange={(event) => setReportMonth(event.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={downloadMonthlyReport}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white"
            >
              <Download size={15} /> Скачать отчёт за месяц
            </button>
          </div>
        </div>
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
