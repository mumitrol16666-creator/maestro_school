"use client";

import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  MonitorPlay,
  Send,
  UsersRound,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { isOfflineCoordinatorRole } from "@/lib/role-labels";
import { adminOfflineApi } from "@/lib/admin-offline-api";
import { teacherOfflineApi } from "@/lib/teacher-offline-api";
import type { TeacherOfflineClass } from "@/types/teacher-offline";

type LessonTab = "today" | "report" | "upcoming" | "processing" | "accepted" | "all";
type LessonStage = "fix" | "report" | "overdue" | "scheduled" | "processing" | "accepted" | "cancelled";

const tabs: Array<{ id: LessonTab; label: string }> = [
  { id: "today", label: "Сегодня" },
  { id: "report", label: "Нужно заполнить" },
  { id: "upcoming", label: "Ближайшие" },
  { id: "processing", label: "На обработке" },
  { id: "accepted", label: "Принятые" },
  { id: "all", label: "Все" },
];

const stageMeta: Record<LessonStage, {
  label: string;
  action: string;
  badge: string;
  border: string;
  muted?: boolean;
}> = {
  fix: {
    label: "Нужно исправить",
    action: "Исправить отчёт",
    badge: "bg-red-50 text-red-800",
    border: "border-red-200 bg-red-50/30",
  },
  overdue: {
    label: "Просрочен",
    action: "Заполнить отчёт",
    badge: "bg-red-600 text-white font-extrabold animate-pulse",
    border: "border-red-500 bg-red-50/20 shadow-[0_0_12px_rgba(239,68,68,0.1)]",
  },
  report: {
    label: "Нужен отчёт",
    action: "Заполнить отчёт",
    badge: "bg-amber-100 text-amber-950",
    border: "border-gold/45 bg-amber-50/45",
  },
  scheduled: {
    label: "Запланирован",
    action: "Открыть урок",
    badge: "bg-sky-50 text-sky-900",
    border: "border-stone-200 bg-white",
  },
  processing: {
    label: "На обработке",
    action: "Посмотреть отчёт",
    badge: "bg-[#f4ead2] text-[#6f5420]",
    border: "border-[#dfc991] bg-[#fffaf0]",
  },
  accepted: {
    label: "Принят",
    action: "Просмотр",
    badge: "bg-emerald-50 text-emerald-800",
    border: "border-stone-200 bg-stone-50",
    muted: true,
  },
  cancelled: {
    label: "Отменён",
    action: "Просмотр",
    badge: "bg-stone-100 text-stone-600",
    border: "border-stone-200 bg-stone-50",
    muted: true,
  },
};

function lessonDateTime(lesson: TeacherOfflineClass, field: "startTime" | "endTime") {
  const date = new Date(lesson.date);
  const [hours, minutes] = lesson[field].split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthPeriod(offset = 0, anchor = new Date()) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + offset + 1, 0);
  return { from: dateInputValue(start), to: dateInputValue(end) };
}

function shiftPeriodMonth(period: { from: string; to: string }, delta: number) {
  const [year, month] = period.from.split("-").map(Number);
  const anchor = Number.isFinite(year) && Number.isFinite(month)
    ? new Date(year, month - 1 + delta, 1)
    : new Date();
  return monthPeriod(0, anchor);
}

function periodQuery(period: { from: string; to: string }) {
  const from = new Date(`${period.from}T00:00:00`);
  const to = new Date(`${period.to}T23:59:59.999`);
  return {
    from: Number.isNaN(from.getTime()) ? undefined : from.toISOString(),
    to: Number.isNaN(to.getTime()) ? undefined : to.toISOString(),
  };
}

function lessonStage(lesson: TeacherOfflineClass, now: Date): LessonStage {
  if (["rejected", "needs_revision"].includes(lesson.status)) return "fix";
  if (lesson.status === "pending_admin_review") return "processing";
  if (lesson.status === "completed") return "accepted";
  if (lesson.status === "cancelled") return "cancelled";
  
  if (lesson.status === "not_filled" || lessonDateTime(lesson, "endTime") < now) {
    const end = lessonDateTime(lesson, "endTime");
    const diffMs = now.getTime() - end.getTime();
    if (diffMs > 60 * 60 * 1000) {
      return "overdue";
    }
    return "report";
  }
  return "scheduled";
}

function formatLessonDate(dateStr: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(dateStr));
}

function formatTimeStamp(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function elapsedLabel(lesson: TeacherOfflineClass, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - lessonDateTime(lesson, "endTime").getTime()) / 60000));
  if (minutes < 60) return `Урок завершился ${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Урок завершился ${hours} ч назад`;
  return `Урок завершился ${Math.floor(hours / 24)} дн. назад`;
}

function dedupeLessons(lessons: TeacherOfflineClass[]) {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  return lessons.filter((lesson) => {
    if (seenIds.has(lesson.crmClassId)) return false;
    seenIds.add(lesson.crmClassId);
    const signature = [
      lesson.date,
      lesson.startTime,
      lesson.endTime,
      lesson.title,
      lesson.teacher?.name,
      lesson.group?.name,
      lesson.room?.name,
    ].map((value) => String(value ?? "").trim()).join("|");
    if (seenSignatures.has(signature)) return false;
    seenSignatures.add(signature);
    return true;
  });
}

export default function AdminOfflineLessonsPage() {
  const { user } = useAuth();
  const isAdmin = isOfflineCoordinatorRole(user?.role);
  const [activeTab, setActiveTab] = useState<LessonTab>("today");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "offline" | "online">("all");
  const [period, setPeriod] = useState(() => monthPeriod());
  const selectedPeriod = periodQuery(period);

  const handleTabChange = (tab: LessonTab) => {
    setActiveTab(tab);
    setTimeout(() => {
      document.getElementById("lessons-list-container")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);
  };
  const resource = useApiResource(
    () => (isAdmin ? adminOfflineApi.agenda() : teacherOfflineApi.agenda(selectedPeriod)),
    [isAdmin, selectedPeriod.from, selectedPeriod.to],
  );
  const pendingResource = useApiResource(
    () => (isAdmin ? adminOfflineApi.pendingReview() : Promise.resolve({ classes: [] })),
    [isAdmin],
  );
  if (resource.loading || (isAdmin && pendingResource.loading)) {
    return <LoadingState label="Загружаем расписание школы" />;
  }

  if (!isAdmin && resource.errorCode === "CRM_NOT_LINKED") {
    return (
      <>
        <PageHeader
          eyebrow="Расписание занятий"
          title="Уроки"
          description="Расписание, отчёты и статусы уроков."
        />
        <EmptyState
          title="Расписание пока не подключено"
          description="Попросите администратора проверить ваш номер телефона и связь с карточкой преподавателя."
        />
      </>
    );
  }

  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;

  const now = new Date();
  const pendingClasses = dedupeLessons(pendingResource.data?.classes ?? []);
  const pendingIds = new Set(pendingClasses.map((lesson) => lesson.crmClassId));
  const classes = dedupeLessons(resource.data?.classes ?? [])
    .filter((lesson) => !pendingIds.has(lesson.crmClassId));
  const lessons = isAdmin ? dedupeLessons([...pendingClasses, ...classes]) : classes;
  const staged = lessons.map((lesson) => ({ lesson, stage: lessonStage(lesson, now) }));
  const teacherOptions = Array.from(new Map(
    lessons
      .filter((lesson) => lesson.teacher?.crmTeacherId)
      .map((lesson) => [
        lesson.teacher!.crmTeacherId,
        lesson.teacher!.name || "Преподаватель",
      ]),
  ).entries()).sort((left, right) => left[1].localeCompare(right[1], "ru"));

  const counts = {
    today: staged.filter(({ lesson }) => isSameDay(new Date(lesson.date), now)).length,
    report: staged.filter(({ stage }) => stage === "report" || stage === "overdue" || stage === "fix").length,
    processing: staged.filter(({ stage }) => stage === "processing").length,
    accepted: staged.filter(({ stage }) => stage === "accepted").length,
  };

  const filtered = staged.filter(({ lesson, stage }) => {
    if (deliveryFilter !== "all" && (lesson.deliveryFormat || "offline") !== deliveryFilter) return false;
    if (selectedTeacherId === "unassigned" && lesson.teacher?.crmTeacherId) return false;
    if (
      selectedTeacherId
      && selectedTeacherId !== "unassigned"
      && lesson.teacher?.crmTeacherId !== selectedTeacherId
    ) return false;
    if (activeTab === "today") return isSameDay(new Date(lesson.date), now);
    if (activeTab === "report") return stage === "report" || stage === "overdue" || stage === "fix";
    if (activeTab === "upcoming") return lessonDateTime(lesson, "startTime") > now && !isSameDay(new Date(lesson.date), now);
    if (activeTab === "processing") return stage === "processing";
    if (activeTab === "accepted") return stage === "accepted";
    return true;
  });

  const priority: Record<LessonStage, number> = {
    fix: 0,
    overdue: 1,
    report: 2,
    scheduled: 3,
    processing: 4,
    accepted: 5,
    cancelled: 6,
  };
  filtered.sort((left, right) => {
    const stageDiff = priority[left.stage] - priority[right.stage];
    if (stageDiff) return stageDiff;
    return lessonDateTime(left.lesson, "startTime").getTime() - lessonDateTime(right.lesson, "startTime").getTime();
  });

  const grouped = filtered.reduce<Record<LessonStage, TeacherOfflineClass[]>>((acc, item) => {
    acc[item.stage].push(item.lesson);
    return acc;
  }, { fix: [], report: [], overdue: [], scheduled: [], processing: [], accepted: [], cancelled: [] });
  const teacherGroups = Array.from(filtered.reduce((acc, item) => {
    const key = item.lesson.teacher?.crmTeacherId || "unassigned";
    const group = acc.get(key) ?? {
      key,
      name: item.lesson.teacher?.name || "Преподаватель не назначен",
      items: [] as Array<{ lesson: TeacherOfflineClass; stage: LessonStage }>,
    };
    group.items.push(item);
    acc.set(key, group);
    return acc;
  }, new Map<string, {
    key: string;
    name: string;
    items: Array<{ lesson: TeacherOfflineClass; stage: LessonStage }>;
  }>()).values()).sort((left, right) => {
    if (left.key === "unassigned") return 1;
    if (right.key === "unassigned") return -1;
    return left.name.localeCompare(right.name, "ru");
  });

  return (
    <>
      <PageHeader
        eyebrow="Расписание занятий"
        title={isAdmin ? "Уроки школы" : "Мои уроки"}
        description={
          isAdmin
            ? "Все занятия школы по преподавателям. Можно открыть урок, помочь заполнить отчёт и проверить результат."
            : "Сначала показаны уроки, где от вас требуется действие."
        }
      />

      {!isAdmin && (
        <section className="mb-6 rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Период кабинета</p>
              <h2 className="mt-1 font-display text-2xl">Уроки за выбранные даты</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid gap-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">С</label>
                <input
                  type="date"
                  value={period.from}
                  onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
                  className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-ink"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">По</label>
                <input
                  type="date"
                  value={period.to}
                  onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
                  className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-ink"
                />
              </div>
              <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
                <button
                  type="button"
                  onClick={() => setPeriod((current) => shiftPeriodMonth(current, -1))}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
                  aria-label="Предыдущий месяц"
                  title="Предыдущий месяц"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod(monthPeriod())}
                  className="h-11 min-w-0 rounded-xl bg-ink px-2 text-sm font-bold text-white transition hover:-translate-y-0.5"
                >
                  Текущий
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod((current) => shiftPeriodMonth(current, 1))}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50"
                  aria-label="Следующий месяц"
                  title="Следующий месяц"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mb-6 grid grid-cols-2 gap-2 sm:mb-8 sm:gap-3 xl:grid-cols-4">
        <SummaryCard
          icon={CalendarDays}
          label="Уроки сегодня"
          hint="Расписание на текущий день"
          value={counts.today}
          tone="sky"
        />
        <SummaryCard
          icon={AlertCircle}
          label="Требуют действия"
          hint="Заполнить или исправить отчёт"
          value={counts.report}
          tone="amber"
        />
        <SummaryCard
          icon={Send}
          label={isAdmin ? "Требуют подтверждения" : "Ждут подтверждения"}
          hint={isAdmin ? "Отчёты и отметки отсутствия" : "Переданы администратору"}
          value={counts.processing}
          tone="cream"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Принятые уроки"
          hint="Подтверждены администратором"
          value={counts.accepted}
          tone="green"
        />
      </section>

      <nav className="mb-8 grid grid-cols-2 gap-1.5 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm sm:grid-cols-3 xl:grid-cols-6" aria-label="Фильтр уроков">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`min-w-0 rounded-xl px-2 py-2.5 text-xs font-bold leading-tight transition sm:px-3 sm:text-sm ${
              activeTab === tab.id
                 ? "bg-ink text-white shadow-sm"
                 : "text-stone-500 hover:bg-stone-50 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="mb-8 rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className={`grid gap-4 ${isAdmin ? "lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end" : "lg:justify-end"}`}>
          {isAdmin ? (
            <label className="block text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
              Преподаватель
              <select
                value={selectedTeacherId}
                onChange={(event) => setSelectedTeacherId(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink outline-none focus:border-gold sm:max-w-md"
              >
                <option value="">Все преподаватели</option>
                {teacherOptions.map(([teacherId, teacherName]) => (
                  <option key={teacherId} value={teacherId}>{teacherName}</option>
                ))}
                <option value="unassigned">Без преподавателя</option>
              </select>
            </label>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Формат</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1" role="group" aria-label="Формат уроков">
              {([['all', 'Все'], ['offline', 'В школе'], ['online', 'Онлайн']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDeliveryFilter(value)}
                  className={`min-h-9 rounded-md px-3 text-xs font-bold transition ${deliveryFilter === value ? "bg-ink text-white" : "text-stone-500 hover:bg-white hover:text-ink"}`}
                  aria-pressed={deliveryFilter === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div id="lessons-list-container" className="scroll-mt-28">
        {filtered.length === 0 ? (
          <EmptyState
            title="В этом разделе уроков нет"
            description="Когда статус урока изменится, он автоматически появится в нужной вкладке."
          />
        ) : (
          isAdmin ? (
            <div className="space-y-10">
              {teacherGroups.map((group) => (
                <TeacherLessonSection
                  key={group.key}
                  name={group.name}
                  items={group.items}
                  now={now}
                  unassigned={group.key === "unassigned"}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-10">
              <LessonSection title="Нужно исправить" lessons={grouped.fix} stage="fix" now={now} />
              <LessonSection title="Просроченные отчёты" lessons={grouped.overdue} stage="overdue" now={now} />
              <LessonSection title="Нужно заполнить отчёт" lessons={grouped.report} stage="report" now={now} />
              {(() => {
                const todayLessons = grouped.scheduled.filter(l => isSameDay(new Date(l.date), now));
                const tomorrowDate = new Date(now);
                tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                const tomorrowLessons = grouped.scheduled.filter(l => isSameDay(new Date(l.date), tomorrowDate));
                const otherLessons = grouped.scheduled.filter(l => !isSameDay(new Date(l.date), now) && !isSameDay(new Date(l.date), tomorrowDate));

                return (
                  <>
                    <LessonSection title="Запланированные на сегодня" lessons={todayLessons} stage="scheduled" now={now} />
                    <LessonSection title="Запланированные на завтра" lessons={tomorrowLessons} stage="scheduled" now={now} />
                    <LessonSection title={activeTab === "upcoming" ? "Ближайшие уроки" : "Запланированные предстоящие"} lessons={otherLessons} stage="scheduled" now={now} />
                  </>
                );
              })()}
              <LessonSection title="На проверке администратора" lessons={grouped.processing} stage="processing" now={now} />
              <LessonSection title="Принято администратором" lessons={grouped.accepted} stage="accepted" now={now} />
              <LessonSection title="Отменённые" lessons={grouped.cancelled} stage="cancelled" now={now} />
            </div>
          )
        )}
      </div>
    </>
  );
}

function TeacherLessonSection({
  name,
  items,
  now,
  unassigned,
}: {
  name: string;
  items: Array<{ lesson: TeacherOfflineClass; stage: LessonStage }>;
  now: Date;
  unassigned: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
          unassigned ? "bg-amber-100 text-amber-900" : "bg-ink text-white"
        }`}>
          {unassigned ? <AlertCircle size={18} /> : <UsersRound size={18} />}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl sm:text-3xl">{name}</h2>
          <p className="text-xs font-semibold text-stone-400">
            {items.length} {items.length === 1 ? "урок" : "уроков"} в выбранном разделе
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {items.map(({ lesson, stage }) => (
          <LessonRow key={lesson.crmClassId} lesson={lesson} stage={stage} now={now} />
        ))}
      </div>
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  hint,
  value,
  tone,
}: {
  icon: typeof CalendarDays;
  label: string;
  hint: string;
  value: number;
  tone: "sky" | "amber" | "cream" | "green";
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    cream: "border-[#dfc991] bg-[#fffaf0] text-[#6f5420]",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <article
      aria-label={`${label}: ${value}`}
      className={`min-h-[108px] rounded-[18px] border p-3.5 text-left shadow-sm sm:min-h-[136px] sm:rounded-[24px] sm:p-5 ${tones[tone]}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 shadow-sm sm:h-10 sm:w-10">
          <Icon size={19} />
        </span>
        <strong className="font-display text-3xl tabular-nums sm:text-4xl">{value}</strong>
      </span>
      <span className="mt-2.5 block text-xs font-black leading-4 sm:mt-3 sm:text-sm">{label}</span>
      <span className="mt-1 hidden text-xs opacity-65 sm:block">{hint}</span>
    </article>
  );
}

function LessonSection({
  title,
  lessons,
  stage,
  now,
}: {
  title: string;
  lessons: TeacherOfflineClass[];
  stage: LessonStage;
  now: Date;
}) {
  if (!lessons.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-3xl">{title}</h2>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">{lessons.length}</span>
      </div>
      <div className="space-y-3">
        {lessons.map((lesson) => (
          <LessonRow key={lesson.crmClassId} lesson={lesson} stage={stage} now={now} />
        ))}
      </div>
    </section>
  );
}

function LessonRow({
  lesson,
  stage,
  now,
}: {
  lesson: TeacherOfflineClass;
  stage: LessonStage;
  now: Date;
}) {
  const isAbsenceNote = stage === "processing"
    && ["no_submission", "not_held"].includes(lesson.teacherOutcomeHint ?? "");
  const meta = isAbsenceNote
    ? {
        ...stageMeta.processing,
        label: lesson.teacherOutcomeHint === "not_held" ? "Урок не состоялся" : "Отсутствие отмечено",
        action: "Проверить отметку",
        badge: "bg-amber-100 text-amber-950",
      }
    : stageMeta[stage];
  const submittedAt = formatTimeStamp(lesson.submittedAt);
  const reviewedAt = formatTimeStamp(lesson.reviewedAt);
  const detail = stage === "report"
    ? elapsedLabel(lesson, now)
    : stage === "processing" && submittedAt
      ? `${isAbsenceNote ? "Отмечено" : "Отправлено"}: ${submittedAt}`
      : stage === "accepted" && reviewedAt
        ? `Принято администратором: ${reviewedAt}`
        : null;

  return (
    <article className={`flex flex-col gap-5 rounded-[24px] border p-5 shadow-soft transition hover:shadow-md sm:flex-row sm:items-center ${meta.border} ${meta.muted ? "opacity-90" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase text-stone-400">
          {formatLessonDate(lesson.date)} · {lesson.startTime}–{lesson.endTime}
        </p>
        <h3 className="font-display mt-2 text-2xl">{lesson.title}</h3>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
          <span>{lesson.group?.name ?? "Индивидуальный урок"}</span>
          {lesson.deliveryFormat === "online" ? (
            <span className="inline-flex items-center gap-1 font-bold text-sky-700"><MonitorPlay size={14} /> Онлайн</span>
          ) : lesson.room?.name ? <span>Кабинет: {lesson.room.name}</span> : null}
          {lesson.teacher?.name ? <span>Преподаватель: {lesson.teacher.name}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${meta.badge}`}>{meta.label}</span>
        {detail ? <span className="text-xs text-stone-500">{detail}</span> : null}
        {lesson.deliveryFormat === "online" && lesson.meetingUrl && stage === "scheduled" ? (
          <a
            href={lesson.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white transition hover:bg-sky-800"
          >
            <MonitorPlay size={15} /> Подключиться
          </a>
        ) : null}
        <Link
          href={`/admin/offline-lessons/${lesson.crmClassId}`}
          className={`mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition hover:-translate-y-0.5 ${
            stage === "report" || stage === "fix"
              ? "bg-ink text-white"
              : "border border-stone-300 bg-white text-ink"
          }`}
        >
          {stage === "accepted"
            ? <FileCheck2 size={15} />
            : isAbsenceNote
              ? <UserX size={15} />
              : stage === "processing"
                ? <Clock3 size={15} />
                : null}
          {meta.action}
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
