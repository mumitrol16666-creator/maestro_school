"use client";

import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { isContentAdminRole } from "@/lib/role-labels";
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
  const isAdmin = isContentAdminRole(user?.role);
  const [activeTab, setActiveTab] = useState<LessonTab>("today");

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
    () => (isAdmin ? adminOfflineApi.agenda() : teacherOfflineApi.agenda()),
    [isAdmin],
  );
  const pendingResource = useApiResource(
    () => (isAdmin ? adminOfflineApi.pendingReview() : Promise.resolve({ classes: [] })),
    [isAdmin],
  );
  const salaryResource = useApiResource(
    () => (!isAdmin ? teacherOfflineApi.salarySummary() : Promise.resolve(null)),
    [isAdmin],
  );

  if (resource.loading || (isAdmin && pendingResource.loading)) {
    return <LoadingState label="Загружаем расписание школы" />;
  }

  if (!isAdmin && resource.errorCode === "CRM_NOT_LINKED") {
    return (
      <>
        <PageHeader
          eyebrow="Офлайн-школа"
          title="Офлайн-уроки"
          description="Расписание, отчёты и статусы уроков."
        />
        <EmptyState
          title="CRM-профиль не подключён"
          description="Аккаунт не связан с преподавателем в CRM. Попросите администратора проверить привязку по телефону."
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

  const counts = {
    today: staged.filter(({ lesson }) => isSameDay(new Date(lesson.date), now)).length,
    report: staged.filter(({ stage }) => stage === "report" || stage === "overdue" || stage === "fix").length,
    processing: staged.filter(({ stage }) => stage === "processing").length,
    accepted: staged.filter(({ stage }) => stage === "accepted").length,
  };

  const filtered = staged.filter(({ lesson, stage }) => {
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

  return (
    <>
      <PageHeader
        eyebrow="Офлайн-школа"
        title="Офлайн-уроки"
        description={
          isAdmin
            ? "Проверяйте отчёты преподавателей и контролируйте закрытие уроков."
            : "Сначала показаны уроки, где от вас требуется действие."
        }
      />

      {!isAdmin && salaryResource.data?.data && (
        <div className="mb-8 overflow-hidden rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Мой баланс за {salaryResource.data.data.periodName}</p>
              <h2 className="mt-1 font-display text-3xl font-bold">
                {(
                  salaryResource.data.data.calculatedSalary +
                  salaryResource.data.data.paidSalary +
                  salaryResource.data.data.pendingSalary +
                  salaryResource.data.data.monthlyBonus -
                  salaryResource.data.data.monthlyFine -
                  salaryResource.data.data.monthlyAdvance
                ).toLocaleString("ru-RU")}{" "}
                ₸
              </h2>
              <p className="mt-1.5 text-xs text-stone-500">
                Рассчитано и ожидает выплаты:{" "}
                <strong className="text-stone-700">
                  {salaryResource.data.data.calculatedSalary.toLocaleString("ru-RU")} ₸
                </strong>
                {" · "}Выплачено:{" "}
                <strong className="text-emerald-700">
                  {salaryResource.data.data.paidSalary.toLocaleString("ru-RU")} ₸
                </strong>
                {" · "}Проведено уроков (не в ведомости):{" "}
                <strong className="text-stone-700">
                  {salaryResource.data.data.pendingSalary.toLocaleString("ru-RU")} ₸
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 rounded-2xl bg-stone-50 p-4 border border-stone-100 sm:self-center">
              <div className="text-center px-3 border-r border-stone-200 last:border-0">
                <span className="block text-[10px] uppercase font-bold text-stone-400 tracking-wider">Индивид.</span>
                <strong className="block text-xs font-bold text-stone-700 mt-0.5">{salaryResource.data.data.rates?.individual || 0} ₸</strong>
              </div>
              <div className="text-center px-3 border-r border-stone-200 last:border-0">
                <span className="block text-[10px] uppercase font-bold text-stone-400 tracking-wider">Группа</span>
                <strong className="block text-xs font-bold text-stone-700 mt-0.5">{salaryResource.data.data.rates?.group || 0} ₸</strong>
              </div>
              <div className="text-center px-3 last:border-0">
                <span className="block text-[10px] uppercase font-bold text-stone-400 tracking-wider">Другие</span>
                <strong className="block text-xs font-bold text-stone-700 mt-0.5">{salaryResource.data.data.rates?.other || 0} ₸</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={CalendarDays}
          label="Уроки сегодня"
          hint="Расписание на текущий день"
          value={counts.today}
          tone="sky"
          active={activeTab === "today"}
          onClick={() => handleTabChange("today")}
        />
        <SummaryCard
          icon={AlertCircle}
          label="Требуют действия"
          hint="Заполнить или исправить отчёт"
          value={counts.report}
          tone="amber"
          active={activeTab === "report"}
          onClick={() => handleTabChange("report")}
        />
        <SummaryCard
          icon={Send}
          label={isAdmin ? "Требуют подтверждения" : "Ждут подтверждения"}
          hint={isAdmin ? "Отчёты преподавателей" : "Отправлены администратору"}
          value={counts.processing}
          tone="cream"
          active={activeTab === "processing"}
          onClick={() => handleTabChange("processing")}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Принятые уроки"
          hint="Подтверждены администратором"
          value={counts.accepted}
          tone="green"
          active={activeTab === "accepted"}
          onClick={() => handleTabChange("accepted")}
        />
      </section>

      <nav className="mb-8 flex gap-2 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm" aria-label="Разделы уроков">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === tab.id
                 ? "bg-ink text-white shadow-sm"
                 : "text-stone-500 hover:bg-stone-50 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div id="lessons-list-container" className="scroll-mt-28">
        {filtered.length === 0 ? (
          <EmptyState
            title="В этом разделе уроков нет"
            description="Когда статус урока изменится, он автоматически появится в нужной вкладке."
          />
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
        )}
      </div>
    </>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  hint,
  value,
  tone,
  active,
  onClick,
}: {
  icon: typeof CalendarDays;
  label: string;
  hint: string;
  value: number;
  tone: "sky" | "amber" | "cream" | "green";
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    cream: "border-[#dfc991] bg-[#fffaf0] text-[#6f5420]",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group min-h-[154px] rounded-[24px] border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${tones[tone]} ${
        active ? "ring-2 ring-ink ring-offset-2" : ""
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/70 shadow-sm">
          <Icon size={19} />
        </span>
        <ChevronRight size={18} className={`transition group-hover:translate-x-1 ${active ? "opacity-100" : "opacity-45"}`} />
      </span>
      <span className="mt-4 block text-sm font-black">{label}</span>
      <span className="mt-1 block text-xs opacity-65">{hint}</span>
      <span className="font-display mt-3 block text-3xl">{value} {value === 1 ? "урок" : "уроков"}</span>
    </button>
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
  const meta = stageMeta[stage];
  const submittedAt = formatTimeStamp(lesson.submittedAt);
  const reviewedAt = formatTimeStamp(lesson.reviewedAt);
  const detail = stage === "report"
    ? elapsedLabel(lesson, now)
    : stage === "processing" && submittedAt
      ? `Отправлено: ${submittedAt}`
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
          {lesson.room?.name ? <span>Кабинет: {lesson.room.name}</span> : null}
          {lesson.teacher?.name ? <span>Преподаватель: {lesson.teacher.name}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${meta.badge}`}>{meta.label}</span>
        {detail ? <span className="text-xs text-stone-500">{detail}</span> : null}
        <Link
          href={`/admin/offline-lessons/${lesson.crmClassId}`}
          className={`mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition hover:-translate-y-0.5 ${
            stage === "report" || stage === "fix"
              ? "bg-ink text-white"
              : "border border-stone-300 bg-white text-ink"
          }`}
        >
          {stage === "accepted" ? <FileCheck2 size={15} /> : stage === "processing" ? <Clock3 size={15} /> : null}
          {meta.action}
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
