"use client";

import {
  BookOpen,
  Bolt,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CircleAlert,
  CircleX,
  AlertTriangle,
  GraduationCap,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Search,
  Send,
  Smartphone,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatAge, formatFio } from "@/lib/name";
import { homeworkStatisticsApi } from "@/lib/homework-statistics-api";
import { formatPhoneDisplay } from "@/lib/phone";
import { aqtobeMonthKey, formatMonthKey, recentMonthKeys } from "@/lib/school-month";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import type { HomeworkStatisticsMetrics } from "@/types/homework-statistics";
import type { TeacherGroup, TeacherStudent } from "@/types/teacher-students";

type RosterTab = "students" | "groups";

const dayLabels: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

function formatLessonDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatAppActivity(value: string | null) {
  if (!value) return "ещё не заходил";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "дата неизвестна";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 2) return "только что";
  if (elapsedMinutes < 60) return `${elapsedMinutes} мин назад`;
  if (elapsedMinutes < 24 * 60) return `${Math.floor(elapsedMinutes / 60)} ч назад`;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
      return { label: "Не был · отметка на проверке", className: "bg-rose-50 text-rose-800", icon: CircleX };
    }
    return { label: "Не был без причины", className: "bg-rose-50 text-rose-800", icon: CircleX };
  }
  return item.attended
    ? { label: "Присутствовал", className: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 }
    : { label: "Не был", className: "bg-stone-100 text-stone-700", icon: CircleX };
}

export default function TeacherStudentsPage() {
  const [tab, setTab] = useState<RosterTab>("students");
  const [search, setSearch] = useState("");
  const [homeworkMonth, setHomeworkMonth] = useState(aqtobeMonthKey);
  const studentsResource = useApiResource(() => teacherStudentsApi.list(), []);
  const groupsResource = useApiResource(() => teacherStudentsApi.groups(), []);
  const homeworkResource = useApiResource(
    () => homeworkStatisticsApi.teacher({ month: homeworkMonth }),
    [homeworkMonth],
  );
  const homeworkMonthOptions = useMemo(() => recentMonthKeys(12), []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "groups") {
      setTab("groups");
    }
  }, []);

  const students = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return (studentsResource.data?.students ?? []).filter((student) => {
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
  }, [studentsResource.data?.students, search]);

  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return (groupsResource.data?.groups ?? []).filter((group) => {
      if (!query) return true;
      return [
        group.name,
        group.direction,
        group.description,
        ...group.students.map((student) => student.name),
      ].some((value) => value?.toLocaleLowerCase("ru").includes(query));
    });
  }, [groupsResource.data?.groups, search]);

  const homeworkByStudent = useMemo(() => new Map(
    (homeworkResource.data?.students.items ?? []).map((student) => [student.crmStudentId, student.metrics]),
  ), [homeworkResource.data?.students.items]);
  const homeworkByGroup = useMemo(() => new Map(
    (homeworkResource.data?.groups ?? []).map((group) => [group.crmGroupId, group.metrics]),
  ), [homeworkResource.data?.groups]);

  const activeResource = tab === "students" ? studentsResource : groupsResource;
  if (activeResource.loading) {
    return <LoadingState label={tab === "students" ? "Загружаем ваших учеников" : "Загружаем ваши группы"} />;
  }

  if (activeResource.errorCode === "CRM_NOT_LINKED") {
    return (
      <>
        <PageHeader
          eyebrow="Кабинет преподавателя"
          title="Ученики и группы"
          description="Ваш учебный состав в школе."
        />
        <EmptyState
          title="Профиль преподавателя не подключён"
          description="Попросите администратора проверить ваш номер телефона и подключить расписание школы."
        />
      </>
    );
  }

  if (activeResource.error) {
    return <ErrorState message={activeResource.error} retry={activeResource.reload} />;
  }

  const allStudents = studentsResource.data?.students ?? [];
  const allGroups = groupsResource.data?.groups ?? [];
  const studentsRequiringAttention = allStudents.filter((student) => student.attentionSignals.length > 0);
  const studentsWithPlan = allStudents.filter((student) => (
    !student.attentionSignals.some((signal) => signal.code === "monthly_plan_missing")
  )).length;
  const groupMembers = new Set(
    allGroups.flatMap((group) => group.students.map((student) => student.crmStudentId)),
  ).size;
  const groupsWithPlan = allGroups.filter((group) => group.planSummary.configured).length;

  return (
    <>
      <PageHeader
        eyebrow="Кабинет преподавателя"
        title="Ученики и группы"
        description="Личные ученики по закреплению в карточке и ваши постоянные группы."
      />

      <section className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1.5">
        <button
          type="button"
          onClick={() => {
            setTab("students");
            setSearch("");
          }}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
            tab === "students" ? "bg-white text-ink shadow-sm" : "text-stone-500"
          }`}
        >
          <UserRound size={17} />
          <span>Мои ученики</span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px]">{allStudents.length}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("groups");
            setSearch("");
          }}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
            tab === "groups" ? "bg-white text-ink shadow-sm" : "text-stone-500"
          }`}
        >
          <Users size={17} />
          <span>Мои группы</span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px]">{allGroups.length}</span>
        </button>
      </section>

      <section className="mb-7 border-y border-stone-200 py-5" aria-labelledby="teacher-homework-summary">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gold">
              <ClipboardList size={15} /> Домашние задания
            </p>
            <h2 id="teacher-homework-summary" className="font-display mt-1 text-2xl">Что происходит с ДЗ</h2>
            <p className="mt-1 text-xs text-stone-500">Задания, назначенные в выбранном месяце вашим ученикам и группам.</p>
          </div>
          <label className="block w-full text-xs font-black text-stone-500 sm:w-56">
            Месяц назначения
            <select
              value={homeworkMonth}
              onChange={(event) => setHomeworkMonth(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-ink outline-none focus:border-gold"
            >
              {homeworkMonthOptions.map((option) => (
                <option key={option} value={option}>{formatMonthKey(option)}</option>
              ))}
            </select>
          </label>
        </div>
        {homeworkResource.loading && !homeworkResource.data ? (
          <p className="mt-5 text-sm text-stone-500">Обновляем результаты ДЗ...</p>
        ) : homeworkResource.error ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{homeworkResource.error}</span>
            <button type="button" onClick={homeworkResource.reload} className="font-bold underline underline-offset-2">Повторить</button>
          </div>
        ) : homeworkResource.data ? (
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <HomeworkSummary icon={ClipboardList} label="Назначено" value={homeworkResource.data.totals.assigned} />
            <HomeworkSummary icon={Send} label="Отправлено" value={homeworkResource.data.totals.submitted} />
            <HomeworkSummary icon={Clock3} label="Ждут проверки" value={homeworkResource.data.totals.waitingReview} tone="text-blue-700" />
            <HomeworkSummary icon={RotateCcw} label="На доработке" value={homeworkResource.data.totals.revision} tone="text-red-700" />
          </div>
        ) : null}
      </section>

      {tab === "students" ? (
        <section className="mb-7 grid grid-cols-3 gap-2 sm:gap-3">
          <Summary icon={Users} label="Мои ученики" value={allStudents.length} />
          <Summary icon={GraduationCap} label="С планом" value={studentsWithPlan} />
          <Summary icon={AlertTriangle} label="Внимание" value={studentsRequiringAttention.length} />
        </section>
      ) : (
        <section className="mb-7 grid grid-cols-3 gap-2 sm:gap-3">
          <Summary icon={Users} label="Ваши группы" value={allGroups.length} />
          <Summary icon={UserRound} label="Участников" value={groupMembers} />
          <Summary icon={BookOpen} label="С планом" value={groupsWithPlan} />
        </section>
      )}

      {tab === "students" && studentsRequiringAttention.length ? (
        <section className="mb-7 rounded-[26px] border border-amber-200 bg-amber-50/70 p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-900">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Учебные сигналы</p>
              <h2 className="font-display text-2xl">Требуют внимания: {studentsRequiringAttention.length}</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {studentsRequiringAttention.slice(0, 6).map((student) => (
              <div key={student.key} className="rounded-2xl border border-amber-200/80 bg-white p-4">
                <p className="font-bold text-ink">{formatFio(student) || student.name}</p>
                <div className="mt-2 space-y-2">
                  {student.attentionSignals.map((signal) => (
                    <p key={signal.code} className="text-sm text-stone-700">
                      <strong>{signal.title}.</strong>{" "}
                      <span className="text-stone-500">{signal.action}.</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6 rounded-[24px] border border-stone-200 bg-white p-4 shadow-soft">
        <label className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
          <Search size={17} className="text-stone-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === "students" ? "Имя, телефон или направление" : "Группа, направление или участник"}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </section>

      {tab === "students" && !students.length ? (
        <EmptyState
          title={allStudents.length ? "Ничего не найдено" : "Ученики пока не назначены"}
          description={
            allStudents.length
              ? "Измените поиск."
              : "Ученик появится здесь, когда администратор закрепит вас преподавателем в его карточке."
          }
        />
      ) : tab === "students" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {students.map((student) => (
            <StudentCard
              key={student.key}
              student={student}
              homework={student.crmStudentId ? homeworkByStudent.get(student.crmStudentId) ?? null : null}
            />
          ))}
        </div>
      ) : !groups.length ? (
        <EmptyState
          title={allGroups.length ? "Ничего не найдено" : "Группы пока не назначены"}
          description={
            allGroups.length
              ? "Измените поиск."
              : "Группа появится здесь, когда администратор назначит вас её преподавателем."
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.crmGroupId}
              group={group}
              homework={homeworkByGroup.get(group.crmGroupId) ?? null}
            />
          ))}
        </div>
      )}
    </>
  );
}

function StudentCard({ student, homework }: { student: TeacherStudent; homework: HomeworkStatisticsMetrics | null }) {
  const router = useRouter();
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusAmount, setBonusAmount] = useState(3);
  const [bonusReason, setBonusReason] = useState("");
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusFeedback, setBonusFeedback] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState<"student" | "parent" | null>(null);
  const [dialogFeedback, setDialogFeedback] = useState<string | null>(null);
  const latestAttendance = student.attendanceHistory[0];
  const latestAttendanceView = latestAttendance ? attendancePresentation(latestAttendance) : null;
  const LatestAttendanceIcon = latestAttendanceView?.icon;
  const displayName = formatFio(student) || student.name;
  const ageLabel = formatAge(student.dateOfBirth);

  async function openDialog(recipient: "student" | "parent") {
    if (!student.appUserId) return;
    setDialogBusy(recipient);
    setDialogFeedback(null);
    try {
      const result = await teacherStudentsApi.openDialog(student.appUserId, recipient);
      router.push(`/admin/messages?conversation=${encodeURIComponent(result.conversationId)}`);
    } catch (error) {
      setDialogFeedback(error instanceof Error ? error.message : "Не удалось открыть переписку");
    } finally {
      setDialogBusy(null);
    }
  }

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
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900">
              Закреплён за вами
            </span>
            {student.sources.includes("online") ? (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-800">
                Есть онлайн-уроки
              </span>
            ) : null}
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

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-stone-100 py-3 text-xs font-semibold text-stone-600">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Smartphone size={15} className={student.appUserId ? "text-emerald-600" : "text-stone-400"} />
          {student.appUserId ? "Кабинет подключён" : "Кабинет не подключён"}
        </span>
        <span className="inline-flex min-w-0 items-center gap-2" title={student.appActivity.lastLoginAt ?? undefined}>
          <Clock3 size={15} className="text-gold" />
          Последний вход: {formatAppActivity(student.appActivity.lastLoginAt ?? student.appActivity.lastActiveAt)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-2">
          <Users size={15} className={student.family.parents.length ? "text-sky-600" : "text-stone-400"} />
          {student.family.parents.length
            ? `Родитель: ${student.family.parents.map((parent) => parent.name).join(", ")}`
            : "Родитель не подключён"}
        </span>
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
            : "Ближайший урок не назначен"}
        </InfoBlock>
      </div>

      <section className="mt-5 border-y border-stone-200 py-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-gold" />
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Динамика обучения</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <LearningMetric label="Посещаемость" value={student.learningSummary.attendanceRate} />
          <LearningMetric label="План месяца" value={student.learningSummary.planCompletionRate} />
          <HomeworkLearningMetric metrics={homework} />
        </div>
        {homework ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-stone-100 pt-3 text-xs font-semibold text-stone-600">
            <span className="text-blue-700">Ждут проверки: {homework.waitingReview}</span>
            <span className="text-red-700">На доработке: {homework.revision}</span>
            <span>Без ответа: {homework.noAttempt}</span>
          </div>
        ) : null}
      </section>

      {student.attentionSignals.length ? (
        <div className="mt-4 space-y-2">
          {student.attentionSignals.map((signal) => (
            <div
              key={signal.code}
              className={`rounded-2xl border p-3 text-sm ${
                signal.tone === "danger"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="font-bold">{signal.title}</p>
              <p className="mt-1 text-xs opacity-80">{signal.action}</p>
            </div>
          ))}
        </div>
      ) : null}

      {student.attendanceHistory.length ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                Последние уроки
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
        {student.crmStudentId ? (
          <Link
            href={`/admin/my-students/student/${encodeURIComponent(student.crmStudentId)}/plan`}
            className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
          >
            <GraduationCap size={14} />
            Открыть план
          </Link>
        ) : null}
        {student.appUserId ? (
          <button
            type="button"
            onClick={() => {
              setBonusOpen((value) => !value);
              setBonusFeedback(null);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-bold text-violet-800 transition hover:bg-violet-100"
          >
            <Bolt size={14} />
            {bonusOpen ? "Скрыть бонус" : "Бонус в лиге"}
          </button>
        ) : null}
        {student.appUserId ? (
          <button
            type="button"
            disabled={dialogBusy !== null}
            onClick={() => void openDialog("student")}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {dialogBusy === "student" ? <LoaderCircle size={14} className="animate-spin" /> : <MessageCircle size={14} />}
            Написать ученику
          </button>
        ) : null}
        {student.appUserId ? (
          <button
            type="button"
            disabled={dialogBusy !== null || student.family.parents.length === 0}
            title={student.family.parents.length ? "Открыть переписку с родителем" : "Родитель пока не подключён"}
            onClick={() => void openDialog("parent")}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-900 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
          >
            {dialogBusy === "parent" ? <LoaderCircle size={14} className="animate-spin" /> : <Users size={14} />}
            Написать родителю
          </button>
        ) : null}
      </div>
      {dialogFeedback ? <p className="mt-3 text-xs font-bold text-red-700">{dialogFeedback}</p> : null}
      {bonusOpen && student.appUserId ? (
        <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Учебное поощрение</p>
          <p className="mt-2 text-xs leading-5 text-stone-600">
            До 10 XP одному ученику в неделю. Баланс и финансовые данные преподавателю не показываются.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[100px_1fr]">
            <div className="text-xs font-bold text-stone-600">
              <label className="block">XP (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={bonusAmount || ""}
                onChange={(event) => {
                  const val = event.target.value === "" ? 0 : Number(event.target.value);
                  setBonusAmount(Math.max(0, Math.min(10, val)));
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500"
              />
              <div className="mt-1 flex gap-1">
                {[10, 5, 3].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBonusAmount(val)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                      bonusAmount === val
                        ? "bg-violet-700 text-white"
                        : "border border-violet-200 bg-white text-violet-800 hover:bg-violet-50"
                    }`}
                  >
                    +{val}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-xs font-bold text-stone-600">
              За что
              <input
                value={bonusReason}
                maxLength={160}
                onChange={(event) => setBonusReason(event.target.value)}
                placeholder="Например: заметный прогресс в ритме"
                className="mt-2 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm outline-none focus:border-violet-500"
              />
            </label>
          </div>
          {bonusFeedback ? <p className="mt-3 text-xs font-bold text-violet-800">{bonusFeedback}</p> : null}
          <button
            type="button"
            disabled={bonusBusy || bonusAmount < 1 || bonusAmount > 10 || bonusReason.trim().length < 3}
            onClick={() => {
              setBonusBusy(true);
              setBonusFeedback(null);
              void teacherStudentsApi.awardWeeklyLeagueBonus({
                studentId: student.appUserId!,
                amount: bonusAmount,
                reason: bonusReason.trim(),
                idempotencyKey: crypto.randomUUID(),
              }).then((result) => {
                setBonusFeedback(result.awarded ? `Начислено +${bonusAmount} XP` : "Этот бонус уже был начислен");
                if (result.awarded) setBonusReason("");
              }).catch((error) => {
                setBonusFeedback(error instanceof Error ? error.message : "Не удалось начислить бонус");
              }).finally(() => setBonusBusy(false));
            }}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bonusBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Bolt size={14} />}
            Начислить +{bonusAmount || 0} XP
          </button>
        </section>
      ) : null}
    </article>
  );
}

function GroupCard({ group, homework }: { group: TeacherGroup; homework: HomeworkStatisticsMetrics | null }) {
  const scheduleLabel = group.schedules.length
    ? group.schedules.map((schedule) => {
        const room = schedule.room?.name ? ` · ${schedule.room.name}` : "";
        return `${dayLabels[schedule.dayOfWeek] ?? schedule.dayOfWeek}, ${schedule.time}${room}`;
      }).join(" · ")
    : "Расписание пока не назначено";

  return (
    <article className="overflow-hidden rounded-[26px] border border-stone-200 bg-paper shadow-soft">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
            style={{ backgroundColor: group.color || "#8b6b2f" }}
          >
            <Users size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl">{group.name}</h2>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-stone-600">
                {group.students.length} участник(ов)
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-gold">{group.direction || "Направление не указано"}</p>
            {group.description ? (
              <p className="mt-2 text-sm leading-relaxed text-stone-500">{group.description}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoBlock icon={CalendarDays} label="Расписание">
            {scheduleLabel}
          </InfoBlock>
          <InfoBlock icon={BookOpen} label="План текущего месяца">
            {group.planSummary.configured
              ? group.planSummary.completionRate == null
                ? "План создан, темы ещё не добавлены"
                : `${group.planSummary.itemsCompleted} из ${group.planSummary.itemsTotal} тем выполнено`
              : "План ещё не составлен"}
          </InfoBlock>
        </div>

        {homework ? (
          <section className="mt-5 border-y border-stone-200 py-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-gold" />
              <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Домашние задания группы</p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <SmallCount label="Назначено" value={homework.assigned} />
              <SmallCount label="Освоено" value={homework.accepted} />
              <SmallCount label="Проверить" value={homework.waitingReview} />
              <SmallCount label="Доработать" value={homework.revision} />
            </div>
          </section>
        ) : null}

        <section className="mt-5 border-t border-stone-200 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Состав группы</p>
              <p className="mt-1 text-xs text-stone-500">Все активные участники группы</p>
            </div>
            <span className="text-sm font-black text-ink">{group.students.length}</span>
          </div>
          {group.students.length ? (
            <div className="mt-3 divide-y divide-stone-100">
              {group.students.map((student) => (
                <div key={student.crmStudentId} className="flex min-w-0 items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 text-stone-500">
                    {student.avatarUrl ? (
                      <img src={student.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{student.name}</p>
                    <p className="mt-0.5 text-xs text-stone-500">Участник группы</p>
                  </div>
                  {student.assignedDirectly ? (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900">
                      Мой ученик
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-500">В группе пока нет активных участников.</p>
          )}
        </section>

        <Link
          href={`/admin/my-students/group/${encodeURIComponent(group.crmGroupId)}/plan`}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white transition hover:bg-stone-700"
        >
          <BookOpen size={16} />
          Открыть план и материалы
        </Link>
      </div>
    </article>
  );
}

function LearningMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-3 text-center">
      <p className="text-lg font-black text-ink">{value == null ? "—" : `${value}%`}</p>
      <p className="mt-1 text-[10px] font-bold text-stone-500">{label}</p>
    </div>
  );
}

function HomeworkLearningMetric({ metrics }: { metrics: HomeworkStatisticsMetrics | null }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-3 text-center">
      <p className="text-lg font-black text-ink">{metrics ? `${metrics.accepted}/${metrics.assigned}` : "—"}</p>
      <p className="mt-1 text-[10px] font-bold text-stone-500">Освоено ДЗ</p>
    </div>
  );
}

function HomeworkSummary({
  icon: Icon,
  label,
  value,
  tone = "text-ink",
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="min-w-0 border-l-2 border-amber-200 pl-3">
      <Icon size={16} className="text-gold" />
      <p className={`mt-2 text-2xl font-black tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] text-stone-500">{label}</p>
    </div>
  );
}

function SmallCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-lg font-black tabular-nums text-ink">{value}</p>
      <p className="mt-1 break-words text-[9px] font-bold leading-3 text-stone-500">{label}</p>
    </div>
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
    <div className="min-h-28 rounded-lg border border-stone-200 bg-white p-3 sm:min-h-0 sm:p-5">
      <Icon size={17} className="text-gold sm:h-[18px] sm:w-[18px]" />
      <p className="font-display mt-3 text-2xl sm:text-3xl">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase leading-4 text-stone-500 sm:text-xs sm:tracking-wide">{label}</p>
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
      <div className="mt-2 text-sm font-semibold leading-relaxed text-ink">{children}</div>
    </div>
  );
}
