"use client";

import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  GraduationCap,
  History,
  MapPin,
  RefreshCw,
  Sparkles,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { parseVideoUrl } from "@/lib/parse-video-url";
import {
  getSchoolAlertCounts,
  markSchoolAlertsSeen,
  type SchoolAlertCounts,
} from "@/lib/student-school-alerts";
import type { SchoolOfflineLesson } from "@/types/school-offline";

/* ─── label maps ────────────────────────────────────────────────────── */

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
  hybrid_1m: "Гибридный 1 мес.",
  hybrid_2m: "Гибридный 2 мес.",
};

/* ─── helpers ───────────────────────────────────────────────────────── */

function formatLessonDate(dateStr: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateStr));
}

function formatShortDate(dateStr: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(dateStr));
}

function MaterialPreview({ material }: { material: SchoolOfflineLesson["materials"][number] }) {
  if (!material.url) return null;
  const parsed = parseVideoUrl(material.url);
  const directVideo = material.type === "video" || material.mimeType?.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(material.url);
  if (directVideo) {
    return <video controls preload="metadata" className="mb-3 max-h-72 w-full rounded-xl bg-black" onClick={(event) => event.stopPropagation()} src={material.url} />;
  }
  if (parsed) {
    return <div className="relative mb-3 aspect-video overflow-hidden rounded-xl bg-black">
      <iframe title={material.title || "Видео к уроку"} src={parsed.embedUrl} className="h-full w-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen onClick={(event) => event.stopPropagation()} />
    </div>;
  }
  if (material.type === "image" || material.mimeType?.startsWith("image/")) {
    return <img src={material.url} alt={material.title || "Материал урока"} className="mb-3 max-h-72 w-full rounded-xl object-contain" loading="lazy" onClick={(event) => event.stopPropagation()} />;
  }
  return null;
}

/* ─── tab types ─────────────────────────────────────────────────────── */

type Tab = "overview" | "homework" | "schedule" | "history";

const tabs: { key: Tab; label: string; mobileLabel: string; icon: typeof GraduationCap }[] = [
  { key: "overview", label: "Обзор", mobileLabel: "Главное", icon: Sparkles },
  { key: "homework", label: "Домашние задания", mobileLabel: "Домашние", icon: BookOpen },
  { key: "schedule", label: "Расписание", mobileLabel: "Уроки", icon: CalendarDays },
  { key: "history", label: "История", mobileLabel: "История", icon: History },
];

/* ─── interactive lesson card ───────────────────────────────────────── */

function LessonCard({
  lesson,
  upcoming,
  defaultOpen,
}: {
  lesson: SchoolOfflineLesson;
  upcoming?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const statusLabel = statusLabels[lesson.status] ?? lesson.status;

  const hasDetails =
    lesson.topic ||
    lesson.lessonGoals ||
    lesson.lessonSummary ||
    lesson.nextLessonFocus ||
    lesson.homework ||
    lesson.materials.length > 0;

  return (
    <article
      className={`rounded-[24px] border shadow-soft transition-all duration-200 ${
        upcoming
          ? "border-gold/20 bg-white"
          : "border-stone-200 bg-paper"
      } ${hasDetails ? "cursor-pointer" : ""}`}
      onClick={() => hasDetails && setOpen(!open)}
    >
      {/* collapsed header */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="flex-1 min-w-0">
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
          {lesson.groupName ? (
            <p className="mt-2 text-xs font-semibold text-stone-400">Группа: {lesson.groupName}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
              lesson.status === "completed"
                ? "bg-emerald-50 text-emerald-800"
                : lesson.status === "pending_admin_review"
                  ? "bg-amber-50 text-amber-900"
                  : lesson.status === "scheduled"
                    ? "bg-blue-50 text-blue-800"
                    : "bg-stone-100 text-stone-600"
            }`}
          >
            {statusLabel}
          </span>
          {hasDetails && (
            <ChevronDown
              size={18}
              className={`text-stone-400 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </div>

      {/* attendance badge — always visible */}
      {!upcoming && lesson.attended != null ? (
        <div className="px-5 pb-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold">
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
        </div>
      ) : null}

      {/* expanded details */}
      {open && (
        <div className="border-t border-stone-100 px-5 pb-5 pt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {lesson.topic ? (
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Тема урока</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{lesson.topic}</p>
            </div>
          ) : null}

          {lesson.status === "completed" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <LessonReportField label="Цели урока" value={lesson.lessonGoals} />
              <LessonReportField label="Что сделали" value={lesson.lessonSummary} />
              <LessonReportField label="Что доработать дальше" value={lesson.nextLessonFocus} />
            </div>
          )}

          {lesson.homework ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Домашнее задание</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{lesson.homework}</p>
            </div>
          ) : null}

          {lesson.materials.length > 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Материалы урока</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lesson.materials.map((material, index) =>
                  material.url ? (
                    <a
                      key={`${material.url}-${index}`}
                      href={material.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="block rounded-2xl bg-stone-100 p-3 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition"
                    >
                      <MaterialPreview material={material} />
                      {material.description ? <span className="mb-2 block max-w-xl text-left text-xs leading-5 text-stone-500">{material.description}</span> : null}
                      {material.title || `Материал ${index + 1}`}
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
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

/* ─── progress timeline ─────────────────────────────────────────────── */

function ProgressTimeline({ lessons }: { lessons: SchoolOfflineLesson[] }) {
  const completed = lessons
    .filter((l) => l.status === "completed")
    .slice(0, 5);

  if (completed.length === 0) return null;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="mb-8 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Прогресс по урокам</p>
      <h2 className="font-display mt-3 text-3xl">Что прошли на занятиях</h2>

      {/* timeline */}
      <div className="mt-8 relative">
        {/* connector line */}
        <div className="absolute left-[19px] top-[28px] bottom-[28px] w-[2px] bg-gradient-to-b from-gold/30 via-stone-200 to-stone-100 sm:hidden" />

        {/* horizontal connector for desktop */}
        <div className="hidden sm:block absolute top-[19px] left-[28px] right-[28px] h-[2px] bg-gradient-to-r from-gold/30 via-stone-200 to-stone-100" />

        {/* nodes — vertical on mobile, horizontal on desktop */}
        <div className="flex flex-col sm:flex-row sm:justify-between gap-6 sm:gap-2">
          {completed.map((lesson) => {
            const isExpanded = expandedId === lesson.crmClassId;
            const color =
              lesson.attended === true
                ? "bg-emerald-500 ring-emerald-200"
                : lesson.attended === false
                  ? "bg-stone-300 ring-stone-200"
                  : "bg-amber-400 ring-amber-200";

            return (
              <div
                key={lesson.crmClassId}
                className="relative flex sm:flex-col sm:items-center sm:text-center gap-4 sm:gap-2 sm:flex-1 cursor-pointer group"
                onClick={() => setExpandedId(isExpanded ? null : lesson.crmClassId)}
              >
                {/* dot */}
                <div className={`relative z-10 h-[38px] w-[38px] shrink-0 rounded-full ring-4 ${color} grid place-items-center transition-transform group-hover:scale-110`}>
                  {lesson.attended === true ? (
                    <CheckCircle2 size={18} className="text-white" />
                  ) : lesson.attended === false ? (
                    <XCircle size={16} className="text-white" />
                  ) : (
                    <Clock3 size={16} className="text-white" />
                  )}
                </div>

                {/* label */}
                <div className="flex-1 sm:flex-none min-w-0">
                  <p className="text-xs font-bold text-stone-500">{formatShortDate(lesson.date)}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink truncate max-w-[160px]">{lesson.topic || lesson.title}</p>

                  {/* expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-soft sm:absolute sm:top-full sm:left-1/2 sm:-translate-x-1/2 sm:mt-4 sm:w-72 sm:z-20">
                      {lesson.lessonSummary ? (
                        <div className="mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Что сделали</p>
                          <p className="mt-1 text-xs leading-5 text-stone-700">{lesson.lessonSummary}</p>
                        </div>
                      ) : null}
                      {lesson.lessonGoals ? (
                        <div className="mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Цели</p>
                          <p className="mt-1 text-xs leading-5 text-stone-700">{lesson.lessonGoals}</p>
                        </div>
                      ) : null}
                      {lesson.nextLessonFocus ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Фокус на след. урок</p>
                          <p className="mt-1 text-xs leading-5 text-stone-700">{lesson.nextLessonFocus}</p>
                        </div>
                      ) : null}
                      {!lesson.lessonSummary && !lesson.lessonGoals && !lesson.nextLessonFocus && (
                        <p className="text-xs text-stone-400">Преподаватель пока не заполнил итог урока.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── homework folder ───────────────────────────────────────────────── */

function HomeworkFolder({ lessons }: { lessons: SchoolOfflineLesson[] }) {
  const withHomework = lessons.filter((l) => l.homework).slice(0, 10);

  if (withHomework.length === 0) {
    return (
      <EmptyState
        title="Домашних заданий пока нет"
        description="После проведённых уроков домашние задания появятся здесь."
      />
    );
  }

  return (
    <div className="space-y-4">
      {withHomework.map((lesson) => (
        <HomeworkCard key={lesson.crmClassId} lesson={lesson} />
      ))}
    </div>
  );
}

function HomeworkCard({ lesson }: { lesson: SchoolOfflineLesson }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className="rounded-[24px] border border-amber-100 bg-white shadow-soft cursor-pointer transition-all hover:border-amber-200"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-amber-600 shrink-0" />
            <h3 className="font-display text-xl truncate">{lesson.title}</h3>
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm text-stone-500">
            <CalendarDays size={13} className="text-gold" />
            {formatLessonDate(lesson.date)}
            {lesson.teacherName && (
              <span className="text-stone-400">· {lesson.teacherName}</span>
            )}
          </p>
          {!open && lesson.homework && (
            <p className="mt-2 text-sm text-stone-600 line-clamp-2">{lesson.homework}</p>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-stone-400 transition-transform duration-200 shrink-0 mt-1 ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>

      {open && (
        <div className="border-t border-amber-100 px-5 pb-5 pt-4 space-y-3">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Домашнее задание</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{lesson.homework}</p>
          </div>

          {lesson.topic ? (
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Тема урока</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{lesson.topic}</p>
            </div>
          ) : null}

          {lesson.materials.length > 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Материалы</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lesson.materials.map((material, index) =>
                  material.url ? (
                    <a
                      key={`${material.url}-${index}`}
                      href={material.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="block rounded-2xl bg-stone-100 p-3 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition"
                    >
                      <MaterialPreview material={material} />
                      {material.description ? <span className="mb-2 block max-w-xl text-left text-xs leading-5 text-stone-500">{material.description}</span> : null}
                      {material.title || `Материал ${index + 1}`}
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

/* ─── tab navigation ────────────────────────────────────────────────── */

function TabNav({
  active,
  onChange,
  alerts,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  alerts: SchoolAlertCounts;
}) {
  return (
    <nav className="mb-8 grid grid-cols-4 gap-1 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-soft">
      {tabs.map(({ key, label, mobileLabel, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          type="button"
          title={label}
          className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold leading-tight transition-all sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
            active === key
              ? "bg-ink text-white shadow-sm"
              : "text-stone-500 hover:bg-stone-50 hover:text-ink"
          }`}
        >
          <Icon size={17} className={active === key ? "text-gold" : undefined} />
          <span className="w-full truncate text-center sm:hidden">{mobileLabel}</span>
          <span className="hidden sm:inline">{label}</span>
          {key === "homework" && alerts.homework > 0 ? (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold px-1 py-0.5 text-[9px] font-black text-ink sm:static sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {alerts.homework}
            </span>
          ) : null}
          {key === "history" && alerts.reports > 0 ? (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold px-1 py-0.5 text-[9px] font-black text-ink sm:static sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {alerts.reports}
            </span>
          ) : null}
          {key === "schedule" && alerts.todayLessons + alerts.tomorrowLessons > 0 ? (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-blue-100 px-1 py-0.5 text-[9px] font-black text-blue-800 sm:static sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {alerts.todayLessons + alerts.tomorrowLessons}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/* ─── main page ─────────────────────────────────────────────────────── */

export default function SchoolLessonsPage() {
  const params = useSearchParams();
  const { user } = useAuth();
  const resource = useApiResource(() => api.studentOfflineSummary(), []);
  const requestedTab = params.get("tab");
  const initialTab = tabs.some((item) => item.key === requestedTab) ? requestedTab as Tab : "overview";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<SchoolAlertCounts>({
    homework: 0,
    reports: 0,
    totalUnread: 0,
    todayLessons: 0,
    tomorrowLessons: 0,
  });

  useEffect(() => {
    if (!user || !resource.data) return;
    if (activeTab === "homework") {
      markSchoolAlertsSeen(user.id, resource.data, "homework");
    }
    if (activeTab === "history") {
      markSchoolAlertsSeen(user.id, resource.data, "reports");
    }
    setAlerts(getSchoolAlertCounts(user.id, resource.data));
  }, [activeTab, resource.data, user]);

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
            description="Обратитесь к администратору школы. После подключения здесь появятся уроки и остаток абонемента."
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
  const groupDayNames = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  async function refreshFromCrm() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      resource.setData(await api.studentOfflineSummary());
      setLastRefreshedAt(new Date());
    } catch {
      setRefreshError("Не удалось обновить данные школы");
    } finally {
      setRefreshing(false);
    }
  }

  /* ── CSV download ──────────────────── */

  function downloadMonthlyReport() {
    const lessons = lessonHistory.filter((lesson) =>
      lesson.status === "completed" && lesson.date.slice(0, 7) === reportMonth,
    );
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
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `maestro-report-${reportMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /* ── upcoming: sorted + limited to 3 ── */
  const upcoming3 = [...upcomingLessons]
    .sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.startTime.localeCompare(b.startTime);
    })
    .slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow="Офлайн-школа"
        title="Уроки в школе"
        description="Расписание занятий в студии, прогресс обучения и домашние задания."
        action={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={refreshFromCrm}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-ink shadow-soft transition hover:border-gold/50 hover:text-gold disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Обновляем" : "Обновить данные"}
            </button>
            {lastRefreshedAt ? (
              <p className="text-xs font-semibold text-stone-400">
                Обновлено {lastRefreshedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </p>
            ) : null}
            {refreshError ? <p className="text-xs font-semibold text-red-600">{refreshError}</p> : null}
          </div>
        }
      />

      <TabNav active={activeTab} onChange={setActiveTab} alerts={alerts} />

      {/* ═══════ TAB: Overview ═══════ */}
      {activeTab === "overview" && (
        <>
          {/* balance cards */}
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
              <WalletCards className="text-gold" size={22} />
              <p className="font-display mt-4 text-3xl">
                {balanceSnapshot.accountBalanceKzt.toLocaleString("ru-RU")} ₸
              </p>
              <p className="mt-1 text-sm text-stone-500">на вашем балансе</p>
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

          {/* progress timeline */}
          <ProgressTimeline lessons={lessonHistory} />

          {/* current membership */}
          {currentMembership ? (
            <section className="mb-8 rounded-[28px] border border-gold/20 bg-ink p-6 text-white shadow-soft sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Текущий абонемент</p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
                <div>
                  <h2 className="font-display text-3xl">
                    {currentMembership.planName ||
                      membershipTypeLabels[currentMembership.type] ||
                      currentMembership.type}
                  </h2>
                  <p className="mt-2 text-sm text-white/65">
                    {[currentMembership.directionName, currentMembership.groupName, currentMembership.teacherName]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-4xl text-gold">
                    {currentMembership.classesRemaining} из {currentMembership.totalClasses}
                  </p>
                  <p className="mt-1 text-xs text-white/50">до {formatLessonDate(currentMembership.endDate)}</p>
                </div>
              </div>

              {currentMembership.individualClassesRemaining !== null &&
                currentMembership.individualClassesRemaining !== undefined && (
                  <div className="mt-6 border-t border-white/10 pt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Индивидуальные</p>
                      <p className="font-display mt-2 text-2xl text-gold">
                        {currentMembership.individualClassesRemaining} ост.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Групповые</p>
                      <p className="font-display mt-2 text-2xl text-gold">
                        {currentMembership.groupClassesRemaining} ост.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Теория</p>
                      <p className="font-display mt-2 text-2xl text-gold">
                        {currentMembership.theoryClassesRemaining} ост.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Заморозки (экс.)</p>
                      <p className="font-display mt-2 text-2xl text-white">
                        {currentMembership.emergencyFreezesAvailable}{" "}
                        <span className="text-white/40 text-xs">/ {currentMembership.emergencyFreezesUsed ?? 0} исп.</span>
                      </p>
                    </div>
                  </div>
                )}
            </section>
          ) : null}

          {/* upcoming 3 lessons */}
          <section className="mb-10">
            <div className="mb-5 flex items-center gap-3">
              <Clock3 className="text-gold" size={22} />
              <h2 className="font-display text-3xl">Ближайшие уроки</h2>
              {upcomingLessons.length > 3 && (
                <button
                  onClick={() => setActiveTab("schedule")}
                  className="ml-auto text-sm font-bold text-gold hover:underline"
                >
                  Все {upcomingLessons.length} →
                </button>
              )}
            </div>
            {upcoming3.length === 0 ? (
              <EmptyState
                title="Ближайших уроков нет"
                description="Когда администратор добавит занятия в расписание, они появятся здесь."
              />
            ) : (
              <div className="space-y-4">
                {upcoming3.map((lesson, i) => (
                  <LessonCard key={lesson.crmClassId} lesson={lesson} upcoming defaultOpen={i === 0} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══════ TAB: Homework ═══════ */}
      {activeTab === "homework" && (
        <>
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <BookOpen className="text-gold" size={22} />
              <h2 className="font-display text-3xl">Домашние задания</h2>
            </div>
            <p className="text-sm text-stone-500">Домашки за последние уроки. Нажмите на карточку, чтобы раскрыть задание.</p>
          </div>
          <HomeworkFolder lessons={lessonHistory} />
        </>
      )}

      {/* ═══════ TAB: Schedule ═══════ */}
      {activeTab === "schedule" && (
        <>
          {/* groups & schedule */}
          {data.profile.groups.length > 0 ? (
            <section className="mb-10 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Мои группы</p>
              <h2 className="font-display mt-3 text-3xl">Ансамбли и расписание</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {data.profile.groups.map((group) => (
                  <div
                    key={group.crmGroupId ?? group.name}
                    className="rounded-2xl border border-gold/20 bg-white p-5"
                  >
                    <p className="font-display text-2xl text-ink">{group.name}</p>
                    <p className="mt-3 text-sm font-semibold text-stone-700">
                      {(group.schedules ?? [])
                        .map((item) => `${groupDayNames[item.dayOfWeek]} ${item.time}`)
                        .join(" · ") || "Расписание уточняется"}
                    </p>
                    {(group.instruments ?? []).length > 0 ? (
                      <p className="mt-2 text-xs text-stone-500">
                        {(group.instruments ?? []).map((item) => `${item.name} ×${item.quantity}`).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* all upcoming lessons */}
          <section>
            <div className="mb-5 flex items-center gap-3">
              <CalendarDays className="text-gold" size={22} />
              <h2 className="font-display text-3xl">Запланированные уроки</h2>
              <span className="ml-2 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">
                {upcomingLessons.length}
              </span>
            </div>
            {upcomingLessons.length === 0 ? (
              <EmptyState
                title="Запланированных уроков нет"
                description="Когда администратор добавит занятия в расписание, они появятся здесь."
              />
            ) : (() => {
              const sortedUpcoming = [...upcomingLessons].sort((a, b) => {
                const dateComp = a.date.localeCompare(b.date);
                if (dateComp !== 0) return dateComp;
                return a.startTime.localeCompare(b.startTime);
              });

              const localNow = new Date();
              const getLocalDateString = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              };
              const todayStr = getLocalDateString(localNow);

              const localTomorrow = new Date(localNow);
              localTomorrow.setDate(localTomorrow.getDate() + 1);
              const tomorrowStr = getLocalDateString(localTomorrow);

              const todayLessons = sortedUpcoming.filter((l) => l.date === todayStr);
              const tomorrowLessons = sortedUpcoming.filter((l) => l.date === tomorrowStr);
              const otherLessons = sortedUpcoming.filter((l) => l.date !== todayStr && l.date !== tomorrowStr);

              return (
                <div className="space-y-8">
                  {todayLessons.length > 0 && (
                    <div>
                      <div className="mb-4 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <h3 className="font-display text-2xl text-stone-800">Сегодня</h3>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">{todayLessons.length}</span>
                      </div>
                      <div className="space-y-4">
                        {todayLessons.map((lesson) => (
                          <LessonCard key={lesson.crmClassId} lesson={lesson} upcoming />
                        ))}
                      </div>
                    </div>
                  )}

                  {tomorrowLessons.length > 0 && (
                    <div>
                      <div className="mb-4 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                        <h3 className="font-display text-2xl text-stone-800">Завтра</h3>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800">{tomorrowLessons.length}</span>
                      </div>
                      <div className="space-y-4">
                        {tomorrowLessons.map((lesson) => (
                          <LessonCard key={lesson.crmClassId} lesson={lesson} upcoming />
                        ))}
                      </div>
                    </div>
                  )}

                  {otherLessons.length > 0 && (
                    <div>
                      <div className="mb-4 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
                        <h3 className="font-display text-2xl text-stone-800">Предстоящие уроки</h3>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600">{otherLessons.length}</span>
                      </div>
                      <div className="space-y-4">
                        {otherLessons.map((lesson) => (
                          <LessonCard key={lesson.crmClassId} lesson={lesson} upcoming />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        </>
      )}

      {/* ═══════ TAB: History ═══════ */}
      {activeTab === "history" && (
        <>
          {/* memberships */}
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
                    {m.individualClassesRemaining !== null && m.individualClassesRemaining !== undefined && (
                      <div className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500 space-y-1">
                        <div className="flex justify-between">
                          <span>Индивидуальные:</span>
                          <span className="font-semibold text-stone-800">{m.individualClassesRemaining}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Групповые:</span>
                          <span className="font-semibold text-stone-800">{m.groupClassesRemaining}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Теория:</span>
                          <span className="font-semibold text-stone-800">{m.theoryClassesRemaining}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Экстренные заморозки:</span>
                          <span className="font-semibold text-stone-800">
                            {m.emergencyFreezesAvailable} (исп. {m.emergencyFreezesUsed ?? 0})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* lesson history */}
          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
                  Подтверждено администратором
                </p>
                <h2 className="font-display mt-2 text-3xl">История и отчёты по урокам</h2>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(event) => setReportMonth(event.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm sm:w-auto"
                />
                <button
                  type="button"
                  onClick={downloadMonthlyReport}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white sm:w-auto"
                >
                  <Download size={15} /> Скачать отчёт за месяц
                </button>
              </div>
            </div>
            {lessonHistory.length === 0 ? (
              <EmptyState
                title="История пуста"
                description="После проведённых занятий здесь появятся темы и домашние задания."
              />
            ) : (
              <div className="space-y-4">
                {lessonHistory.map((lesson) => (
                  <LessonCard key={lesson.crmClassId} lesson={lesson} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
