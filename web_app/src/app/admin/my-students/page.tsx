"use client";

import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleX,
  GraduationCap,
  MessageCircle,
  Search,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatAge, formatFio } from "@/lib/name";
import { formatPhoneDisplay } from "@/lib/phone";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import type { TeacherStudent, TeacherStudentSource } from "@/types/teacher-students";

type SourceFilter = "all" | TeacherStudentSource;

const dayLabels: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

const sourceFilters: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "offline", label: "Офлайн" },
  { id: "online", label: "Онлайн" },
];

function nextOnlineLesson(student: TeacherStudent) {
  const now = Date.now();
  return student.onlineLessons
    .filter((lesson) => lesson.scheduledAt && new Date(lesson.scheduledAt).getTime() >= now)
    .sort((left, right) => (
      new Date(left.scheduledAt!).getTime() - new Date(right.scheduledAt!).getTime()
    ))[0];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLessonDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function attendancePresentation(item: TeacherStudent["attendanceHistory"][number]) {
  if (item.attendanceStatus === "present") {
    return { label: "Присутствовал", className: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 };
  }
  if (item.attendanceStatus === "late") {
    return { label: "Опоздал", className: "bg-amber-50 text-amber-900", icon: CircleAlert };
  }
  if (item.attendanceStatus === "excused_absence") {
    return { label: "Не был · уважительная причина", className: "bg-sky-50 text-sky-800", icon: CircleX };
  }
  if (item.attendanceStatus === "unexcused_absence") {
    if (item.classStatus === "pending_admin_review") {
      return { label: "Не был · прогул ожидает подтверждения", className: "bg-rose-50 text-rose-800", icon: CircleX };
    }
    if (item.chargeSource === "membership") {
      return { label: "Не был · занятие списано", className: "bg-rose-50 text-rose-800", icon: CircleX };
    }
    if (item.chargeAmount > 0) {
      return {
        label: `Не был · списано ${item.chargeAmount.toLocaleString("ru-RU")} ₸`,
        className: "bg-rose-50 text-rose-800",
        icon: CircleX,
      };
    }
    return { label: "Не был · прогул подтверждён", className: "bg-rose-50 text-rose-800", icon: CircleX };
  }
  return item.attended
    ? { label: "Присутствовал", className: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 }
    : { label: "Не был", className: "bg-stone-100 text-stone-700", icon: CircleX };
}

export default function TeacherStudentsPage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const resource = useApiResource(() => teacherStudentsApi.list(), []);

  const students = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return (resource.data?.students ?? []).filter((student) => {
      if (source !== "all" && !student.sources.includes(source)) return false;
      if (!query) return true;
      return [
        student.name,
        student.middleName,
        student.phone,
        student.email,
        student.login,
        ...student.directions,
        ...student.groups.map((group) => group.name),
      ].some((value) => value?.toLocaleLowerCase("ru").includes(query));
    });
  }, [resource.data?.students, search, source]);

  if (resource.loading) return <LoadingState label="Загружаем ваших учеников" />;

  if (resource.errorCode === "CRM_NOT_LINKED") {
    return (
      <>
        <PageHeader
          eyebrow="Кабинет преподавателя"
          title="Мои ученики"
          description="Ваши офлайн- и онлайн-ученики в одном месте."
        />
        <EmptyState
          title="Профиль преподавателя не подключён"
          description="Попросите администратора проверить ваш номер телефона и подключить расписание школы."
        />
      </>
    );
  }

  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;

  const allStudents = resource.data?.students ?? [];
  const offlineCount = allStudents.filter((student) => student.sources.includes("offline")).length;
  const onlineCount = allStudents.filter((student) => student.sources.includes("online")).length;

  return (
    <>
      <PageHeader
        eyebrow="Кабинет преподавателя"
        title="Мои ученики"
        description="Здесь собраны назначенные вам ученики из школы и онлайн-уроков."
      />

      <section className="mb-7 grid gap-3 sm:grid-cols-3">
        <Summary icon={Users} label="Всего учеников" value={allStudents.length} />
        <Summary icon={GraduationCap} label="Офлайн" value={offlineCount} />
        <Summary icon={Video} label="Онлайн" value={onlineCount} />
      </section>

      <section className="mb-6 rounded-[24px] border border-stone-200 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="flex flex-1 items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
            <Search size={17} className="text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, телефон, направление или группа"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <div className="flex gap-1 rounded-2xl bg-stone-100 p-1">
            {sourceFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSource(item.id)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                  source === item.id ? "bg-white text-ink shadow-sm" : "text-stone-500 hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!students.length ? (
        <EmptyState
          title={allStudents.length ? "Ничего не найдено" : "Ученики пока не назначены"}
          description={
            allStudents.length
              ? "Измените поиск или фильтр."
              : "Назначьте преподавателя ученику, группе или онлайн-уроку — после этого ученик появится здесь."
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {students.map((student) => <StudentCard key={student.key} student={student} />)}
        </div>
      )}
    </>
  );
}

function StudentCard({ student }: { student: TeacherStudent }) {
  const upcomingOnline = nextOnlineLesson(student);
  const activeMembership = student.memberships[0];
  const latestAttendance = student.attendanceHistory[0];
  const latestAttendanceView = latestAttendance ? attendancePresentation(latestAttendance) : null;
  const LatestAttendanceIcon = latestAttendanceView?.icon;
  const displayName = formatFio(student) || student.name;
  const ageLabel = formatAge(student.dateOfBirth);

  return (
    <article className="rounded-[26px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-amber-50 text-gold">
          {student.avatarUrl ? (
            <img src={student.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound size={24} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl">{displayName}</h2>
            {ageLabel ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-900">
                {ageLabel}
              </span>
            ) : null}
            {student.sources.map((item) => (
              <span
                key={item}
                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                  item === "offline"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-sky-50 text-sky-800"
                }`}
              >
                {item === "offline" ? "Офлайн" : "Онлайн"}
              </span>
            ))}
            {latestAttendanceView && LatestAttendanceIcon && !latestAttendance?.attended ? (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${latestAttendanceView.className}`}>
                <LatestAttendanceIcon size={12} />
                Последний урок пропущен
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-ink">{formatPhoneDisplay(student.phone)}</p>
          {student.email ? <p className="mt-1 truncate text-xs text-stone-500">{student.email}</p> : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {student.directions.length ? student.directions.map((direction) => (
          <span key={direction} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600">
            {direction}
          </span>
        )) : (
          <span className="text-xs text-stone-400">Направление не указано</span>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoBlock icon={Users} label="Группа">
          {student.groups.length
            ? student.groups.map((group) => group.name).join(", ")
            : "Индивидуально / онлайн"}
        </InfoBlock>
        <InfoBlock icon={CalendarDays} label="Расписание">
          {student.schedules.length
            ? student.schedules.map((item) => `${dayLabels[item.dayOfWeek] ?? item.dayOfWeek}, ${item.time}`).join(" · ")
            : upcomingOnline?.scheduledAt
              ? formatDateTime(upcomingOnline.scheduledAt)
              : "Ближайший урок не назначен"}
        </InfoBlock>
        <InfoBlock icon={BookOpenCheck} label="Абонемент">
          {activeMembership
            ? `${activeMembership.classesRemaining} занятий осталось`
            : "Нет активного абонемента у этого преподавателя"}
        </InfoBlock>
        <InfoBlock icon={Video} label="Онлайн-уроки">
          {student.onlineLessons.length
            ? `${student.onlineLessons.length} в истории`
            : "Нет назначенных онлайн-уроков"}
        </InfoBlock>
      </div>

      {student.attendanceHistory.length ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                Последние офлайн-уроки
              </p>
              <p className="mt-1 text-xs text-stone-500">Посещаемость этого ученика</p>
            </div>
            <CalendarDays size={17} className="text-gold" />
          </div>
          <div className="divide-y divide-stone-100">
            {student.attendanceHistory.map((item) => {
              const view = attendancePresentation(item);
              const StatusIcon = view.icon;
              return (
                <div key={item.crmClassId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{item.title || "Занятие"}</p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {formatLessonDate(item.date)} · {item.startTime}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${view.className}`}>
                    <StatusIcon size={13} />
                    {view.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-200 pt-5">
        {student.appUserId ? (
          <Link
            href={`/admin/messages?contact=${student.appUserId}`}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-stone-700"
          >
            <MessageCircle size={14} />
            Написать ученику
          </Link>
        ) : null}
        {upcomingOnline ? (
          <Link
            href={`/admin/online-lessons/${upcomingOnline.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-ink transition hover:border-gold/40"
          >
            <Video size={14} />
            Открыть онлайн-урок
          </Link>
        ) : null}
        {student.appUserId ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">
            Аккаунт приложения подключён
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-500">
            Аккаунт приложения не подключён
          </span>
        )}
      </div>
    </article>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[22px] border border-stone-200 bg-white p-5">
      <Icon size={18} className="text-gold" />
      <p className="font-display mt-3 text-3xl">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Users;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <div className="flex items-center gap-2 text-stone-400">
        <Icon size={14} />
        <p className="text-[10px] font-black uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-ink">{children}</p>
    </div>
  );
}
