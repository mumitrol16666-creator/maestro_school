"use client";

function formatMonthTitle(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split("-");
  const monthNum = parseInt(monthStr, 10) - 1;
  const monthNames = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  return `${monthNames[monthNum] || monthStr} ${yearStr}`;
}

import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Download,
  FileSpreadsheet,
  GraduationCap,
  History,
  MapPin,
  MonitorPlay,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LessonMaterialItems } from "@/components/student-lesson-materials";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import {
  getSchoolAlertCounts,
  markSchoolAlertsSeen,
  type SchoolAlertCounts,
} from "@/lib/student-school-alerts";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import { MonthlyReportModal } from "@/components/monthly-report-modal";
import { StudentLessonCalendar } from "@/components/student-lesson-calendar";
import {
  schoolDateLabel,
  studentLessonTitle,
} from "@/lib/student-lesson-display";
import { downloadMonthlyReportExcel } from "@/lib/monthly-report-excel";

/* ─── label maps ────────────────────────────────────────────────────── */

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  not_filled: "Итоги готовятся",
  cancelled: "Отменён",
};

/* ─── helpers ───────────────────────────────────────────────────────── */

function formatLessonDate(dateStr: string) {
  return schoolDateLabel(dateStr);
}

/* ─── tab types ─────────────────────────────────────────────────────── */

type Tab = "schedule" | "history";
type LessonFormatFilter = "all" | "offline" | "online";

const tabs: {
  key: Tab;
  label: string;
  mobileLabel: string;
  icon: typeof GraduationCap;
}[] = [
  {
    key: "schedule",
    label: "Календарь",
    mobileLabel: "Календарь",
    icon: CalendarDays,
  },
  {
    key: "history",
    label: "Прошедшие",
    mobileLabel: "Прошедшие",
    icon: History,
  },
];

/* ─── interactive lesson card ───────────────────────────────────────── */

function LessonCard({
  lesson,
  upcoming,
  defaultOpen,
  hideDate = false,
}: {
  lesson: SchoolOfflineLesson;
  upcoming?: boolean;
  defaultOpen?: boolean;
  hideDate?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const statusLabel = statusLabels[lesson.status] ?? lesson.status;
  const isOnline = lesson.deliveryFormat === "online";
  const hasLearningResults =
    (lesson.lessonPoints ?? 0) > 0 ||
    (lesson.planTopicResults?.length ?? 0) > 0 ||
    (lesson.learningTopicResults?.length ?? 0) > 0 ||
    (lesson.learningPlanCompletionResults?.length ?? 0) > 0;

  const hasDetails =
    lesson.topic ||
    lesson.lessonGoals ||
    lesson.lessonSummary ||
    lesson.nextLessonFocus ||
    lesson.homework ||
    lesson.materials.length > 0 ||
    hasLearningResults;

  return (
    <article className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-bold text-ink">
            {hasDetails ? (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-controls={`lesson-details-${lesson.crmClassId}`}
                className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {studentLessonTitle(lesson)}
              </button>
            ) : (
              studentLessonTitle(lesson)
            )}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-stone-500">
            <span className="font-semibold tabular-nums text-stone-700">
              {!hideDate ? `${formatLessonDate(lesson.date)} · ` : ""}
              {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}
            </span>
            {lesson.teacherName ? (
              <span className="inline-flex min-w-0 items-start gap-1">
                <UserRound size={13} className="mt-1 shrink-0" />
                <span className="break-words">{lesson.teacherName}</span>
              </span>
            ) : null}
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-sky-700">
                <MonitorPlay size={13} />
                Онлайн
              </span>
            ) : lesson.roomName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} />
                {lesson.roomName}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {upcoming &&
          isOnline &&
          ["scheduled", "started"].includes(lesson.status) ? (
            lesson.meetingUrl && /^https?:\/\//i.test(lesson.meetingUrl) ? (
              <a
                href={lesson.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-white"
              >
                <MonitorPlay size={14} />
                Подключиться
              </a>
            ) : (
              <span className="text-xs text-stone-500">
                Ссылка появится здесь
              </span>
            )
          ) : null}
          {!(upcoming && lesson.status === "scheduled") ? (
            <span
              className={`rounded-lg px-2 py-1 text-xs font-medium ${lesson.status === "completed" ? "bg-emerald-50 text-emerald-800" : lesson.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}
            >
              {!upcoming &&
              lesson.status === "completed" &&
              lesson.attended != null
                ? lesson.attended
                  ? "Посетил"
                  : "Пропуск"
                : statusLabel}
            </span>
          ) : null}
          {hasDetails ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls={`lesson-details-${lesson.crmClassId}`}
              aria-label={`${open ? "Скрыть" : "Открыть"} подробности: ${studentLessonTitle(lesson)}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {open ? "Свернуть" : "Подробнее"}
              <ChevronDown size={15} className={open ? "rotate-180" : ""} />
            </button>
          ) : null}
        </div>
      </div>

      {open && (
        <div
          id={`lesson-details-${lesson.crmClassId}`}
          className="border-t border-stone-100 p-3 space-y-3 sm:p-4"
        >
          {lesson.topic ? (
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Тема урока
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                {lesson.topic}
              </p>
            </div>
          ) : null}

          {lesson.status === "completed" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <LessonReportField
                label="Цели урока"
                value={lesson.lessonGoals}
              />
              <LessonReportField
                label="Что сделали"
                value={lesson.lessonSummary}
              />
              <LessonReportField
                label="Что доработать дальше"
                value={lesson.nextLessonFocus}
              />
            </div>
          )}

          {lesson.status === "completed" && hasLearningResults ? (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-violet-700">
                Учебный результат
              </p>
              {(lesson.lessonPoints ?? 0) > 0 ? (
                <p className="mt-2 text-sm font-bold text-violet-950">
                  +{lesson.lessonPoints} учебных баллов
                </p>
              ) : null}
              {lesson.learningTopicResults?.length ? (
                <div className="mt-3 space-y-2">
                  {lesson.learningTopicResults.map((item) => (
                    <div
                      key={`${item.topicId}-${item.occurredAt}`}
                      data-testid="learning-topic-result"
                      className="rounded-xl border border-violet-100 bg-white/80 p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="min-w-0 text-sm font-bold leading-5 text-violet-950">
                          {item.title}
                        </p>
                        <span
                          className={`shrink-0 self-start rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            item.mastered
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {item.mastered ? "Освоено" : "В работе"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-900">
                          {item.fromPercent == null
                            ? "—"
                            : `${item.fromPercent}%`}{" "}
                          → {item.toPercent}%
                        </span>
                        {item.masteryPointsAwarded > 0 ? (
                          <span className="rounded-lg bg-gold/20 px-2.5 py-1 text-xs font-black text-amber-950">
                            +{item.masteryPointsAwarded} учебных баллов
                          </span>
                        ) : null}
                      </div>
                      {item.comment ? (
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-stone-600">
                          {item.comment}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {lesson.learningPlanCompletionResults?.length ? (
                <div className="mt-3 space-y-2">
                  {lesson.learningPlanCompletionResults.map((item) => (
                    <div
                      key={`${item.planId}-${item.completedAt}`}
                      data-testid="learning-plan-completion-result"
                      className="rounded-xl border border-gold/40 bg-gold/10 p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                            Учебный план · {formatMonthTitle(item.month)}
                          </p>
                          <p className="mt-1 text-sm font-bold text-amber-950">
                            План месяца завершён
                          </p>
                        </div>
                        <span className="shrink-0 self-start rounded-lg bg-gold/25 px-2.5 py-1 text-xs font-black text-amber-950 sm:self-auto">
                          +{item.pointsAwarded} учебных баллов
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {lesson.planTopicResults?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {lesson.planTopicResults.map((item) => (
                    <span
                      key={item.itemId}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        item.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {item.title} ·{" "}
                      {item.status === "completed" ? "освоено" : "в работе"}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {lesson.homework ? (
            <Link
              href={`/tasks/school/${encodeURIComponent(lesson.crmClassId)}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-amber-50 px-3 text-sm font-semibold text-amber-900"
            >
              Открыть задание →
            </Link>
          ) : null}

          {lesson.materials.length > 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Материалы урока
              </p>
              <LessonMaterialItems materials={lesson.materials} />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

function GroupedLessonList({
  lessons,
  upcoming = false,
  requestedLessonId,
}: {
  lessons: SchoolOfflineLesson[];
  upcoming?: boolean;
  requestedLessonId?: string | null;
}) {
  const groups = new Map<string, SchoolOfflineLesson[]>();
  const sorted = [...lessons].sort((a, b) => {
    const dates = a.date.slice(0, 10).localeCompare(b.date.slice(0, 10));
    return (
      (upcoming ? dates : -dates) || a.startTime.localeCompare(b.startTime)
    );
  });
  for (const lesson of sorted) {
    const date = lesson.date.slice(0, 10);
    groups.set(date, [...(groups.get(date) ?? []), lesson]);
  }
  return (
    <div className="space-y-4">
      {[...groups].map(([date, items]) => (
        <section key={date} aria-label={formatLessonDate(date)}>
          <h3 className="mb-2 text-xs font-semibold capitalize text-stone-500">
            {schoolDateLabel(date, true)}{" "}
            <span className="ml-1 text-stone-400">· {items.length}</span>
          </h3>
          <div className="space-y-2">
            {items.map((lesson) => (
              <LessonCard
                key={lesson.crmClassId}
                lesson={lesson}
                upcoming={upcoming}
                defaultOpen={lesson.crmClassId === requestedLessonId}
                hideDate
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LessonReportField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
        {value}
      </p>
    </div>
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
    <nav
      aria-label="Разделы уроков"
      className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-stone-200 bg-white p-1"
    >
      {tabs.map(({ key, label, mobileLabel, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          type="button"
          title={label}
          aria-pressed={active === key}
          className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold leading-tight transition-colors sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
            active === key
              ? "bg-ink text-white shadow-sm"
              : "text-stone-500 hover:bg-stone-50 hover:text-ink"
          }`}
        >
          <Icon
            size={17}
            className={active === key ? "text-gold" : undefined}
          />
          <span className="w-full truncate text-center sm:hidden">
            {mobileLabel}
          </span>
          <span className="hidden sm:inline">{label}</span>
          {key === "history" && alerts.reports > 0 ? (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold px-1 py-0.5 text-[9px] font-black text-ink sm:static sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {alerts.reports}
            </span>
          ) : null}
          {key === "schedule" &&
          alerts.todayLessons + alerts.tomorrowLessons > 0 ? (
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

function SchoolSchedule() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const resource = useApiResource(() => api.studentOfflineSummary(), []);
  const requestedTab = params.get("tab");
  const requestedFormat = params.get("format");
  const requestedLessonId = params.get("lesson");
  const activeTab: Tab = requestedTab === "history" ? "history" : "schedule";
  function setActiveTab(tab: Tab) {
    const query = new URLSearchParams(params.toString());
    query.set("tab", tab);
    query.delete("lesson");
    router.push(`/school-lessons?${query.toString()}`, { scroll: false });
  }
  const [lessonFormatFilter, setLessonFormatFilter] =
    useState<LessonFormatFilter>(
      requestedFormat === "online" || requestedFormat === "offline"
        ? requestedFormat
        : "all",
    );
  const [reportMonth, setReportMonth] = useState(currentAqtobeMonth);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [historyFilterMonth, setHistoryFilterMonth] = useState<string>("auto");
  useEffect(() => {
    setHistoryFilterMonth("auto");
  }, [requestedLessonId]);
  useEffect(() => {
    setLessonFormatFilter(
      requestedFormat === "online" || requestedFormat === "offline"
        ? requestedFormat
        : "all",
    );
  }, [requestedFormat]);
  const [alerts, setAlerts] = useState<SchoolAlertCounts>({
    homework: 0,
    reports: 0,
    totalUnread: 0,
    todayLessons: 0,
    tomorrowLessons: 0,
  });

  const lessonHistory = resource.data?.lessonHistory ?? [];
  const availableMonths = useMemo(() => {
    const monthsMap = new Map<string, number>();
    for (const lesson of lessonHistory) {
      if (!lesson.date) continue;
      const monthKey = lesson.date.slice(0, 7);
      monthsMap.set(monthKey, (monthsMap.get(monthKey) ?? 0) + 1);
    }
    return Array.from(monthsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, count]) => ({
        monthKey,
        count,
        title: formatMonthTitle(monthKey),
      }));
  }, [lessonHistory]);

  const activeMonth =
    historyFilterMonth === "auto"
      ? lessonHistory
          .find((lesson) => lesson.crmClassId === requestedLessonId)
          ?.date.slice(0, 7) ||
        reportMonth ||
        (availableMonths[0]?.monthKey ?? currentAqtobeMonth())
      : historyFilterMonth;

  const displayHistory = useMemo(() => {
    if (activeMonth === "all") return lessonHistory;
    return lessonHistory.filter(
      (lesson) => lesson.date && lesson.date.startsWith(activeMonth),
    );
  }, [lessonHistory, activeMonth]);

  useEffect(() => {
    if (!user || !resource.data) return;
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
            eyebrow="Обучение Maestro"
            title="Расписание"
            description="Даты, время и место занятий."
          />
          <EmptyState
            title="Профиль школы не подключён"
            description="Обратитесь к администратору школы. После подключения здесь появится расписание."
          />
        </>
      );
    }
    return <ErrorState message={resource.error} retry={resource.reload} />;
  }

  const data = resource.data;
  if (!data) {
    return (
      <ErrorState
        message="Не удалось загрузить данные"
        retry={resource.reload}
      />
    );
  }

  const { upcomingLessons } = data;
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
    if (data) {
      downloadMonthlyReportExcel(data, reportMonth);
    }
  }

  const filteredUpcomingLessons =
    lessonFormatFilter === "all"
      ? upcomingLessons
      : upcomingLessons.filter(
          (lesson) =>
            (lesson.deliveryFormat || "offline") === lessonFormatFilter,
        );

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Расписание</h1>
          <p className="mt-1 text-sm text-stone-500">
            Даты, время и место занятий
          </p>
        </div>
        <button
          type="button"
          onClick={refreshFromCrm}
          disabled={refreshing}
          aria-label={
            refreshing ? "Обновляем расписание" : "Обновить расписание"
          }
          title={
            lastRefreshedAt
              ? `Обновлено ${lastRefreshedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
              : "Обновить расписание"
          }
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50"
        >
          <RefreshCw
            size={18}
            className={refreshing ? "animate-spin" : undefined}
          />
        </button>
      </header>
      {refreshError ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {refreshError}
        </p>
      ) : null}

      <TabNav active={activeTab} onChange={setActiveTab} alerts={alerts} />

      {/* ═══════ TAB: Schedule ═══════ */}
      {activeTab === "schedule" && (
        <section aria-label="Все занятия" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-3">
            <div
              className="inline-flex rounded-xl border border-stone-200 bg-white p-1"
              role="group"
              aria-label="Формат уроков"
            >
              {(
                [
                  ["all", "Все"],
                  ["offline", "В школе"],
                  ["online", "Онлайн"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLessonFormatFilter(value)}
                  aria-pressed={lessonFormatFilter === value}
                  className={`min-h-11 rounded-lg px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-gold ${lessonFormatFilter === value ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <StudentLessonCalendar
            data={{
              ...data,
              upcomingLessons: filteredUpcomingLessons,
              lessonHistory:
                lessonFormatFilter === "all"
                  ? lessonHistory
                  : lessonHistory.filter(
                      (lesson) =>
                        (lesson.deliveryFormat || "offline") ===
                        lessonFormatFilter,
                    ),
            }}
            requestedLessonId={requestedLessonId}
            onHistory={(id) =>
              router.push(
                `/school-lessons?tab=history&lesson=${encodeURIComponent(id)}`,
              )
            }
          />
          {data.profile.groups.length ? (
            <details className="rounded-2xl border border-stone-200 bg-white px-4">
              <summary className="cursor-pointer py-4 text-sm font-semibold">
                Мои группы · {data.profile.groups.length}
              </summary>
              <div className="divide-y divide-stone-100 pb-3">
                {data.profile.groups.map((group) => (
                  <div
                    key={group.crmGroupId || group.name}
                    className="py-3 first:pt-0"
                  >
                    <p className="break-words text-sm font-semibold">
                      {group.name}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {(group.schedules ?? [])
                        .map(
                          (item) =>
                            `${groupDayNames[item.dayOfWeek]} ${item.time}`,
                        )
                        .join(" · ") || "Расписание уточняется"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      )}

      {/* ═══════ TAB: History ═══════ */}
      {activeTab === "history" && (
        <>
          {/* lesson history */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">История занятий</h2>
              <select
                aria-label="Месяц истории"
                value={activeMonth}
                onChange={(event) => {
                  setHistoryFilterMonth(event.target.value);
                  if (event.target.value !== "all")
                    setReportMonth(event.target.value);
                }}
                className="min-h-11 max-w-full rounded-xl border border-stone-200 bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-gold"
              >
                <option value="all">
                  Все занятия ({lessonHistory.length})
                </option>
                {!availableMonths.some(
                  (month) => month.monthKey === activeMonth,
                ) && activeMonth !== "all" ? (
                  <option value={activeMonth}>
                    {formatMonthTitle(activeMonth)} (0)
                  </option>
                ) : null}
                {availableMonths.map((month) => (
                  <option key={month.monthKey} value={month.monthKey}>
                    {month.title} ({month.count})
                  </option>
                ))}
              </select>
            </div>
            <details className="mb-4 rounded-2xl border border-stone-200 bg-white px-4">
              <summary className="cursor-pointer py-3 text-sm font-semibold">
                Отчёт за месяц
              </summary>
              <div className="flex flex-wrap items-end gap-2 pb-4">
                <label className="grid min-w-0 max-w-full gap-1 text-xs text-stone-500">
                  Месяц отчёта
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(event) => setReportMonth(event.target.value)}
                    className="min-h-11 min-w-0 max-w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-ink"
                  />
                </label>
                <button
                  type="button"
                  disabled={!reportMonth}
                  onClick={() => setReportModalOpen(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <FileSpreadsheet size={15} />
                  Открыть отчёт
                </button>
                <button
                  type="button"
                  disabled={!reportMonth}
                  onClick={downloadMonthlyReport}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold disabled:opacity-50"
                >
                  <Download size={15} />
                  Скачать Excel
                </button>
              </div>
            </details>

            {displayHistory.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
                {activeMonth === "all"
                  ? "История занятий пока пуста."
                  : "В этом месяце занятий пока нет. Выберите другой месяц или все занятия."}
              </p>
            ) : (
              <GroupedLessonList
                lessons={displayHistory}
                requestedLessonId={requestedLessonId}
              />
            )}
          </section>
        </>
      )}

      {data && (
        <MonthlyReportModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          summary={data}
          initialMonth={reportMonth}
        />
      )}
    </>
  );
}

// Keep existing notifications and bookmarked homework links working without a second homework screen.
export default function SchoolLessonsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const isHomework = params.get("tab") === "homework";
  const id = params.get("lesson");
  useEffect(() => {
    if (isHomework)
      router.replace(
        id
          ? `/tasks/school/${encodeURIComponent(id)}`
          : "/tasks?source=offline",
      );
  }, [isHomework, id, router]);
  return isHomework ? (
    <LoadingState label="Открываем задание в обучении" />
  ) : (
    <SchoolSchedule />
  );
}
