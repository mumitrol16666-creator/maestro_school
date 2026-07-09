"use client";

import { CheckCircle2, LoaderCircle, Send, Play, XCircle, ShieldCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { SuccessModal } from "@/components/success-modal";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { isContentAdminRole } from "@/lib/role-labels";
import { adminOfflineApi } from "@/lib/admin-offline-api";
import { teacherOfflineApi } from "@/lib/teacher-offline-api";
import type { TeacherOfflineStudent, TrialLessonReport } from "@/types/teacher-offline";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  cancelled: "Отменён",
};

const attendanceLabels: Record<string, string> = {
  unmarked: "Не отмечен",
  present: "Присутствовал",
  late: "Опоздал",
  excused_absence: "Уважительная причина",
  unexcused_absence: "Пропуск",
};

const attendanceClasses: Record<string, string> = {
  unmarked: "bg-stone-100 text-stone-600",
  present: "bg-emerald-50 text-emerald-800",
  late: "bg-amber-50 text-amber-900",
  excused_absence: "bg-sky-50 text-sky-900",
  unexcused_absence: "bg-red-50 text-red-800",
};

const trialObjectionOptions = [
  ["price", "Цена"],
  ["schedule", "Расписание"],
  ["distance", "Далеко"],
  ["format", "Формат"],
  ["teacher", "Преподаватель"],
  ["child_interest", "Интерес ребенка"],
  ["thinking", "Думают"],
  ["other", "Другое"],
] as const;

type TrialSectionUpdater = <K extends keyof TrialLessonReport>(
  section: K,
  patch: NonNullable<TrialLessonReport[K]>,
) => void;

const defaultTrialReport: TrialLessonReport = {
  version: 1,
  attendance: { outcome: "attended", arrivedWith: "unknown", parentPresent: false },
  studentProfile: { priorExperience: "unknown", motivation: "unclear" },
  teacherAssessment: {
    interestLevel: null,
    contactLevel: null,
    focusLevel: null,
    rhythm: null,
    hearing: null,
    coordination: null,
    memory: null,
    techniqueBase: null,
    emotionalReadiness: null,
  },
  lessonFacts: {},
  recommendation: {
    recommendedFormat: "undecided",
    recommendedFrequency: "undecided",
    recommendedLevel: "beginner",
    nextStep: "manager_call",
  },
  salesSignals: {
    buyProbability: null,
    priceSensitivity: "unknown",
    scheduleFit: "unknown",
    parentObjections: [],
  },
  raw: {},
};

function mergeTrialReport(report?: TrialLessonReport | null): TrialLessonReport {
  return {
    ...defaultTrialReport,
    ...(report ?? {}),
    attendance: { ...defaultTrialReport.attendance, ...(report?.attendance ?? {}) },
    studentProfile: { ...defaultTrialReport.studentProfile, ...(report?.studentProfile ?? {}) },
    teacherAssessment: { ...defaultTrialReport.teacherAssessment, ...(report?.teacherAssessment ?? {}) },
    lessonFacts: { ...defaultTrialReport.lessonFacts, ...(report?.lessonFacts ?? {}) },
    recommendation: { ...defaultTrialReport.recommendation, ...(report?.recommendation ?? {}) },
    salesSignals: { ...defaultTrialReport.salesSignals, ...(report?.salesSignals ?? {}) },
    raw: { ...defaultTrialReport.raw, ...(report?.raw ?? {}) },
  };
}

function scoreFromInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function trialReportReady(report: TrialLessonReport) {
  return Boolean(
    report.attendance?.outcome
      && report.studentProfile?.priorExperience
      && report.studentProfile.priorExperience !== "unknown"
      && report.studentProfile?.motivation
      && report.studentProfile.motivation !== "unclear"
      && report.teacherAssessment?.interestLevel
      && report.teacherAssessment?.contactLevel
      && report.lessonFacts?.whatWasTested?.trim()
      && report.lessonFacts?.whatWorkedWell?.trim()
      && report.recommendation?.recommendedFormat
      && report.recommendation.recommendedFormat !== "undecided"
      && report.salesSignals?.buyProbability
      && report.salesSignals?.teacherSalesComment?.trim()
  );
}

function lessonStartDateTime(date: string | Date, startTime: string) {
  const base = new Date(date);
  const [hours = 0, minutes = 0] = startTime.split(":").map(Number);
  base.setHours(hours, minutes, 0, 0);
  return base;
}

export default function AdminOfflineLessonDetailPage() {
  const params = useParams<{ crmClassId: string }>();
  const crmClassId = params.crmClassId;
  const { user } = useAuth();
  const isAdmin = isContentAdminRole(user?.role);
  const canManageAttendance = isAdmin;

  const lessonResource = useApiResource(
    () => (isAdmin ? adminOfflineApi.classCard(crmClassId) : teacherOfflineApi.classCard(crmClassId)),
    [crmClassId, isAdmin],
  );
  const studentsResource = useApiResource(
    () => (isAdmin ? adminOfflineApi.students(crmClassId) : teacherOfflineApi.students(crmClassId)),
    [crmClassId, isAdmin],
  );

  const [topic, setTopic] = useState("");
  const [lessonGoals, setLessonGoals] = useState("");
  const [lessonSummary, setLessonSummary] = useState("");
  const [homework, setHomework] = useState("");
  const [nextLessonFocus, setNextLessonFocus] = useState("");
  const [materialsText, setMaterialsText] = useState("");
  const [comment, setComment] = useState("");
  const [trialReport, setTrialReport] = useState<TrialLessonReport>(() => mergeTrialReport());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lesson = lessonResource.data;
  const students = studentsResource.data?.students ?? [];
  const isTrialLesson = lesson?.classType === "trial";
  const isTrialReportReady = isTrialLesson ? trialReportReady(trialReport) : true;
  const canEditTeacherReport = !isAdmin && lesson && lesson.status === "started";
  const canEditAdminReview = isAdmin && lesson?.status === "pending_admin_review";
  const canEditReport = Boolean(canEditTeacherReport || canEditAdminReview);
  const canApprove = isAdmin && lesson?.status === "pending_admin_review";
  const isNotHeld = lesson?.teacherOutcomeHint === "not_held";
  const unmarkedCount = students.filter((student) => (student.attendanceStatus ?? "unmarked") === "unmarked").length;
  const canShowStartPrompt = Boolean(
    !isAdmin
      && lesson?.status === "scheduled"
      && lessonStartDateTime(lesson.date, lesson.startTime).getTime() - Date.now() <= 15 * 60 * 1000,
  );

  useEffect(() => {
    if (!lesson) return;
    if (lesson.topic) setTopic(lesson.topic);
    if (lesson.lessonGoals) setLessonGoals(lesson.lessonGoals);
    if (lesson.lessonSummary) setLessonSummary(lesson.lessonSummary);
    if (lesson.homeworkDraft) setHomework(lesson.homeworkDraft);
    if (lesson.nextLessonFocus) setNextLessonFocus(lesson.nextLessonFocus);
    if (lesson.materials) {
      setMaterialsText(lesson.materials.map((item) => item.url || item.title || "").filter(Boolean).join("\n"));
    }
    if (lesson.teacherComment) setComment(lesson.teacherComment);
    if (lesson.classType === "trial") {
      setTrialReport(mergeTrialReport(lesson.trialReport));
    }
  }, [lesson]);

  const updateTrialSection: TrialSectionUpdater = function updateTrialSection<K extends keyof TrialLessonReport>(
    section: K,
    patch: NonNullable<TrialLessonReport[K]>,
  ) {
    setTrialReport((current) => ({
      ...current,
      [section]: {
        ...((current[section] ?? {}) as object),
        ...(patch as object),
      },
    }));
  };

  function toggleTrialObjection(value: string) {
    setTrialReport((current) => {
      const selected = new Set(current.salesSignals?.parentObjections ?? []);
      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
      }
      return {
        ...current,
        salesSignals: {
          ...current.salesSignals,
          parentObjections: Array.from(selected),
        },
      };
    });
  }

  async function runAction(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await Promise.all([lessonResource.reload(), studentsResource.reload()]);
      if (action === "submit") {
        setSuccess("Урок отправлен на подтверждение администратору");
      } else if (action === "not-held") {
        setSuccess("Отмечено: урок не состоялся");
      } else if (action === "start") {
        setSuccess("Урок начат");
      } else if (action === "approve") {
        setSuccess("Урок подтверждён и опубликован для ученика");
      } else if (action === "return") {
        setSuccess("Урок возвращён преподавателю для исправления");
      } else if (action === "withdraw") {
        setSuccess("Отправка отозвана — урок снова доступен для редактирования");
      } else if (action === "reopen") {
        setSuccess("Урок открыт повторно, списания возвращены");
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось выполнить действие");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const confirmed = window.confirm(
      `Отправить на подтверждение именно этот урок?\n\n${lesson?.title ?? ""}\n${lesson ? new Intl.DateTimeFormat("ru-RU").format(new Date(lesson.date)) : ""} · ${lesson?.startTime ?? ""}`,
    );
    if (!confirmed) return;
    await runAction("submit", () =>
      teacherOfflineApi.submit(crmClassId, {
        topic: isTrialLesson ? undefined : topic.trim(),
        lessonGoals: lessonGoals.trim() || undefined,
        lessonSummary: isTrialLesson ? undefined : lessonSummary.trim(),
        homeworkDraft: isTrialLesson ? undefined : homework.trim(),
        nextLessonFocus: isTrialLesson ? undefined : nextLessonFocus.trim() || undefined,
        materials: materialsText
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url) => ({ type: "link", url, title: url })),
        comment: comment.trim() || undefined,
        trialReport: isTrialLesson
          ? { ...trialReport, capturedAt: new Date().toISOString() }
          : undefined,
        teacherOutcomeHint: "held",
      }),
    );
  }

  async function updateAttendance(studentId: string, attendanceStatus: string, teacherNote?: string) {
    if (!canManageAttendance) return;
    await runAction(`attendance-${studentId}`, () =>
      adminOfflineApi.attendance(crmClassId, studentId, attendanceStatus, teacherNote),
    );
  }

  async function handleApprove() {
    if (!isNotHeld && unmarkedCount > 0) {
      setError(`Отметьте посещаемость у всех учеников (осталось: ${unmarkedCount})`);
      return;
    }
    await runAction("approve", () =>
      adminOfflineApi.approve(crmClassId, {
        deduct: !isNotHeld,
        topic: topic.trim() || undefined,
        lessonGoals: lessonGoals.trim() || undefined,
        lessonSummary: lessonSummary.trim() || undefined,
        homeworkDraft: homework.trim() || undefined,
        nextLessonFocus: nextLessonFocus.trim() || undefined,
        teacherComment: comment.trim() || undefined,
        trialReport: isTrialLesson
          ? { ...trialReport, capturedAt: trialReport.capturedAt ?? new Date().toISOString() }
          : undefined,
        materials: materialsText
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url) => ({ type: "link", url, title: url })),
      }),
    );
  }

  function askReason(message: string) {
    if (!window.confirm(message)) return null;
    const reason = window.prompt("Укажите причину — она нужна для контроля изменений:")?.trim();
    if (!reason || reason.length < 3) {
      setError("Укажите причину изменения");
      return null;
    }
    return reason;
  }

  if (lessonResource.loading || studentsResource.loading) {
    return <LoadingState label="Загружаем карточку урока" />;
  }

  if (lessonResource.error || !lesson) {
    return <ErrorState message={lessonResource.error ?? "Урок не найден"} retry={lessonResource.reload} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Офлайн-урок"
        title={lesson.title}
        description={`${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(lesson.date))} · ${lesson.startTime}–${lesson.endTime}`}
        action={
          <Link href="/admin/offline-lessons" className="text-sm font-bold text-gold hover:underline">
            ← К расписанию
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <span className="rounded-full bg-stone-100 px-4 py-2 text-xs font-bold text-stone-700">
          {statusLabels[lesson.status] ?? lesson.status}
        </span>
        {lesson.group?.name ? (
          <span className="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">
            {lesson.group.name}
          </span>
        ) : null}
        {lesson.room?.name ? (
          <span className="rounded-full bg-sky-50 px-4 py-2 text-xs font-bold text-sky-900">
            {lesson.room.name}
          </span>
        ) : null}
      </div>

      {isNotHeld ? (
        <div className="mb-6 rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-red-900">Преподаватель отметил: урок не состоялся</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-800/80">
            {lesson.teacherComment || "Причина не указана."}
          </p>
          <p className="mt-2 text-xs font-semibold text-red-700">
            При подтверждении списаний не будет. Если отметка ошибочна — верните урок преподавателю.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-7 xl:grid-cols-[1fr_420px]">
        <section className="order-last xl:order-none space-y-7">
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-3xl">Отчёт по уроку</h2>
            <p className="mt-2 text-sm text-stone-500">
              {isTrialLesson
                ? "Заполните диагностическую анкету пробного. CRM сохранит данные для будущего AI-анализа и плана обучения."
                : isAdmin
                ? "Проверьте отчёт преподавателя, при необходимости отредактируйте и подтвердите урок."
                : "Заполните тему, итог и домашнее задание. Ученик увидит материалы после подтверждения администратором."}
            </p>

            {isTrialLesson ? (
              <TrialReportEditor
                report={trialReport}
                disabled={!canEditReport}
                updateSection={updateTrialSection}
                toggleObjection={toggleTrialObjection}
              />
            ) : (
              <>
                <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Тема урока
                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что проходили на занятии?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Цель урока
                  <textarea
                    value={lessonGoals}
                    onChange={(event) => setLessonGoals(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что планировали освоить?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Итог урока
                  <textarea
                    value={lessonSummary}
                    onChange={(event) => setLessonSummary(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что получилось, что разобрали, какой результат?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Домашнее задание
                  <textarea
                    value={homework}
                    onChange={(event) => setHomework(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-32 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="Что отработать до следующего урока?"
                  />
                </label>

                <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Фокус следующего урока
                  <textarea
                    value={nextLessonFocus}
                    onChange={(event) => setNextLessonFocus(event.target.value)}
                    disabled={!canEditReport}
                    className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                    placeholder="С чего продолжить на следующем занятии?"
                  />
                </label>
              </>
            )}

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Материалы и ссылки
              <textarea
                value={materialsText}
                onChange={(event) => setMaterialsText(event.target.value)}
                disabled={!canEditReport}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Одна ссылка на строку"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий для админа
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={!canEditReport}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Замечания по ученикам, сложности, рекомендации — всё, что важно для администратора"
              />
            </label>

            {!isAdmin ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!canEditTeacherReport || busy != null || (isTrialLesson ? !isTrialReportReady : (!topic.trim() || !lessonSummary.trim()))}
                  className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy === "submit" ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                  Отправить на подтверждение
                </button>
              </div>
            ) : null}
          </form>

          <StudentRoster
            students={students}
            canManageAttendance={canManageAttendance}
            canEdit={canEditReport}
            busy={busy}
            studentsError={studentsResource.error}
            onRetryStudents={studentsResource.reload}
            onUpdateAttendance={updateAttendance}
          />
        </section>

        <aside className="order-first xl:order-none space-y-4">
          {!isAdmin && lesson.status === "scheduled" ? (
            <button
              disabled={busy != null}
              onClick={() => void runAction("start", () => teacherOfflineApi.start(crmClassId))}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-700 px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "start" ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}
              Начать урок
            </button>
          ) : null}

          {!isAdmin && canEditTeacherReport ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason(
                  `Отметить, что именно этот урок не состоялся?\n\n${lesson.title} · ${new Intl.DateTimeFormat("ru-RU").format(new Date(lesson.date))} · ${lesson.startTime}`,
                );
                if (reason) void runAction("not-held", () => teacherOfflineApi.notHeld(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800 disabled:opacity-50"
            >
              {busy === "not-held" ? <LoaderCircle className="animate-spin" size={16} /> : <XCircle size={16} />}
              Урок не состоялся
            </button>
          ) : null}

          {canApprove ? (
            <button
              disabled={busy != null || (!isNotHeld && (isTrialLesson ? !isTrialReportReady : (!topic.trim() || !lessonSummary.trim())))}
              onClick={() => void handleApprove()}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-700 px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "approve" ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              Подтвердить урок
            </button>
          ) : null}

          {canApprove ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason("Вернуть урок преподавателю для исправления?");
                if (reason) void runAction("return", () => adminOfflineApi.returnToTeacher(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 disabled:opacity-50"
            >
              {busy === "return" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Вернуть преподавателю
            </button>
          ) : null}

          {!isAdmin && lesson.status === "pending_admin_review" ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason("Отозвать отправленный урок и снова открыть редактирование?");
                if (reason) void runAction("withdraw", () => teacherOfflineApi.withdraw(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 disabled:opacity-50"
            >
              {busy === "withdraw" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Отозвать и исправить
            </button>
          ) : null}

          {isAdmin && ["completed", "cancelled"].includes(lesson.status) ? (
            <button
              disabled={busy != null}
              onClick={() => {
                const reason = askReason(
                  lesson.status === "cancelled"
                    ? "Восстановить отменённый урок в расписании?"
                    : "Открыть подтверждённый урок повторно? Все списания будут возвращены.",
                );
                if (reason) void runAction("reopen", () => adminOfflineApi.reopen(crmClassId, reason));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-violet-300 bg-violet-50 px-5 py-4 text-sm font-bold text-violet-900 disabled:opacity-50"
            >
              {busy === "reopen" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              {lesson.status === "cancelled" ? "Восстановить урок" : "Пересмотреть урок"}
            </button>
          ) : null}

          {canApprove && !isNotHeld && unmarkedCount > 0 ? (
            <p className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Перед подтверждением отметьте посещаемость у {unmarkedCount} ученик(ов).
            </p>
          ) : null}

          {lesson.status === "pending_admin_review" ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
                <CheckCircle2 size={16} />
                Отправлено на проверку
              </p>
              <p className="mt-2 text-sm text-amber-800/80">
                {isAdmin
                  ? "Отметьте посещаемость и нажмите «Подтвердить урок», чтобы опубликовать ДЗ ученику."
                  : "Администратор отметит посещаемость в CRM, подтвердит урок и опубликует ДЗ ученику."}
              </p>
            </div>
          ) : null}

          {lesson.status === "completed" && lesson.topic ? (
            <div className="rounded-[24px] border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Опубликовано</p>
              <p className="mt-3 text-sm leading-6 text-stone-700">{lesson.topic}</p>
              {lesson.homeworkDraft ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-600">{lesson.homeworkDraft}</p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {canShowStartPrompt && lesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-stone-200 bg-paper p-6 shadow-2xl sm:p-8">
            <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Play className="fill-emerald-600 text-emerald-600" size={32} />
              </div>
              <h3 className="font-display text-2xl font-bold text-stone-900">Начать урок</h3>
              <p className="mt-3 text-sm text-stone-500 leading-relaxed">
                Вы собираетесь начать офлайн-урок <strong className="text-stone-700">{lesson.title}</strong>.
                {lesson.group?.name ? ` Группа: ${lesson.group.name}.` : ""}
              </p>
              
              <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-xs text-stone-600 w-full text-left space-y-2 border border-stone-100">
                <div className="flex justify-between">
                  <span className="font-medium text-stone-400">Дата урока:</span>
                  <span className="font-bold text-stone-700">
                    {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(lesson.date))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-stone-400">Время начала:</span>
                  <span className="font-bold text-stone-700">{lesson.startTime}</span>
                </div>
              </div>

              {error ? (
                <div className="mt-5 w-full rounded-2xl border border-red-100 bg-red-50 p-3 text-left text-xs font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 w-full">
                <button
                  disabled={busy != null}
                  onClick={() => void runAction("start", () => teacherOfflineApi.start(crmClassId))}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 text-sm font-bold text-white transition-all hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy === "start" ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  Начать урок
                </button>
                <Link
                  href="/admin/offline-lessons"
                  className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 px-5 py-3.5 text-sm font-bold text-stone-600 transition-all hover:bg-stone-100"
                >
                  Вернуться в расписание
                </Link>
              </div>

              <p className="mt-5 text-xs text-stone-400 leading-normal">
                Начать урок можно не ранее чем за 15 минут до его начала.
              </p>
            </div>
          </div>
        </div>
      )}

      <SuccessModal
        open={Boolean(success)}
        title={success ?? ""}
        description="Данные сохранены в CRM."
        onClose={() => setSuccess(null)}
      />
    </>
  );
}

function TrialReportEditor({
  report,
  disabled,
  updateSection,
  toggleObjection,
}: {
  report: TrialLessonReport;
  disabled: boolean;
  updateSection: TrialSectionUpdater;
  toggleObjection: (value: string) => void;
}) {
  const assessment = report.teacherAssessment ?? {};
  const facts = report.lessonFacts ?? {};
  const profile = report.studentProfile ?? {};
  const recommendation = report.recommendation ?? {};
  const sales = report.salesSignals ?? {};
  const raw = report.raw ?? {};
  const selectedObjections = new Set(sales.parentObjections ?? []);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-bold text-amber-950">Пробный урок: диагностическая анкета</p>
        <p className="mt-2 text-sm leading-6 text-amber-900/80">
          Эти данные сохраняются в CRM как структура для будущего AI-анализа: портрет ученика, навыки, риски продажи и примерный маршрут обучения.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Итог посещения
          <select
            value={report.attendance?.outcome ?? "attended"}
            onChange={(event) => updateSection("attendance", { outcome: event.target.value as any })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="attended">Пришел и занимался</option>
            <option value="late">Опоздал, но занимался</option>
            <option value="no_show">Не пришел</option>
            <option value="rescheduled">Перенесли</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          С кем пришел
          <select
            value={report.attendance?.arrivedWith ?? "unknown"}
            onChange={(event) => updateSection("attendance", { arrivedWith: event.target.value as any, parentPresent: event.target.value === "parent" })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="unknown">Не указано</option>
            <option value="parent">С родителем</option>
            <option value="alone">Самостоятельно</option>
            <option value="other">Другое</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Опыт до пробного
          <select
            value={profile.priorExperience ?? "unknown"}
            onChange={(event) => updateSection("studentProfile", { priorExperience: event.target.value as any })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="unknown">Не понял</option>
            <option value="none">С нуля</option>
            <option value="basic">Базовый</option>
            <option value="medium">Средний</option>
            <option value="strong">Сильный</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Мотивация
          <select
            value={profile.motivation ?? "unclear"}
            onChange={(event) => updateSection("studentProfile", { motivation: event.target.value as any })}
            disabled={disabled}
            className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
          >
            <option value="unclear">Не ясно</option>
            <option value="student">Хочет ученик</option>
            <option value="parent">Хочет родитель</option>
            <option value="both">Оба заинтересованы</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TrialScore label="Интерес" value={assessment.interestLevel} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { interestLevel: value })} />
        <TrialScore label="Контакт" value={assessment.contactLevel} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { contactLevel: value })} />
        <TrialScore label="Фокус" value={assessment.focusLevel} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { focusLevel: value })} />
        <TrialScore label="Ритм" value={assessment.rhythm} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { rhythm: value })} />
        <TrialScore label="Слух" value={assessment.hearing} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { hearing: value })} />
        <TrialScore label="Координация" value={assessment.coordination} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { coordination: value })} />
        <TrialScore label="Память" value={assessment.memory} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { memory: value })} />
        <TrialScore label="Техника" value={assessment.techniqueBase} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { techniqueBase: value })} />
        <TrialScore label="Готовность" value={assessment.emotionalReadiness} disabled={disabled} onChange={(value) => updateSection("teacherAssessment", { emotionalReadiness: value })} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrialTextarea label="Цель родителя" value={profile.goalFromParent} disabled={disabled} onChange={(value) => updateSection("studentProfile", { goalFromParent: value })} />
        <TrialTextarea label="Цель ученика" value={profile.goalFromStudent} disabled={disabled} onChange={(value) => updateSection("studentProfile", { goalFromStudent: value })} />
        <TrialTextarea label="Что проверили" value={facts.whatWasTested} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { whatWasTested: value })} />
        <TrialTextarea label="Что получилось" value={facts.whatWorkedWell} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { whatWorkedWell: value })} />
        <TrialTextarea label="Трудности" value={facts.difficulties} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { difficulties: value })} />
        <TrialTextarea label="Реакция на задания" value={facts.reactionToTasks} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { reactionToTasks: value })} />
        <TrialTextarea label="Реакция родителя" value={facts.parentReaction} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { parentReaction: value })} />
        <TrialTextarea label="Дали домой" value={facts.homeworkGiven} disabled={disabled} onChange={(value) => updateSection("lessonFacts", { homeworkGiven: value })} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Рекомендованный формат
          <select value={recommendation.recommendedFormat ?? "undecided"} onChange={(event) => updateSection("recommendation", { recommendedFormat: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="undecided">Пока не ясно</option>
            <option value="group">Группа</option>
            <option value="individual">Индивидуально</option>
            <option value="hybrid">Гибрид</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Частота
          <select value={recommendation.recommendedFrequency ?? "undecided"} onChange={(event) => updateSection("recommendation", { recommendedFrequency: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="undecided">Пока не ясно</option>
            <option value="1_per_week">1 раз в неделю</option>
            <option value="2_per_week">2 раза в неделю</option>
            <option value="3_per_week">3 раза в неделю</option>
            <option value="custom">Индивидуально</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Уровень
          <select value={recommendation.recommendedLevel ?? "beginner"} onChange={(event) => updateSection("recommendation", { recommendedLevel: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="beginner">Новичок</option>
            <option value="basic">База</option>
            <option value="intermediate">Средний</option>
            <option value="advanced">Сильный</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Следующий шаг
          <select value={recommendation.nextStep ?? "manager_call"} onChange={(event) => updateSection("recommendation", { nextStep: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="manager_call">Созвон менеджера</option>
            <option value="sell_membership">Продавать абонемент</option>
            <option value="second_trial">Второй пробный</option>
            <option value="wait">Подождать решение</option>
            <option value="reject">Не подходит</option>
          </select>
        </label>
        <TrialTextarea label="Фокус первого месяца" value={recommendation.firstMonthFocus} disabled={disabled} onChange={(value) => updateSection("recommendation", { firstMonthFocus: value })} />
        <TrialTextarea label="Комментарий менеджеру" value={sales.teacherSalesComment} disabled={disabled} onChange={(value) => updateSection("salesSignals", { teacherSalesComment: value })} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TrialScore label="Вероятность покупки" value={sales.buyProbability} disabled={disabled} onChange={(value) => updateSection("salesSignals", { buyProbability: value })} />
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Чувствительность к цене
          <select value={sales.priceSensitivity ?? "unknown"} onChange={(event) => updateSection("salesSignals", { priceSensitivity: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="unknown">Не ясно</option>
            <option value="low">Низкая</option>
            <option value="medium">Средняя</option>
            <option value="high">Высокая</option>
          </select>
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Подходит расписание
          <select value={sales.scheduleFit ?? "unknown"} onChange={(event) => updateSection("salesSignals", { scheduleFit: event.target.value as any })} disabled={disabled} className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm">
            <option value="unknown">Не ясно</option>
            <option value="good">Да</option>
            <option value="medium">Нужно подбирать</option>
            <option value="bad">Плохо подходит</option>
          </select>
        </label>
      </div>

      <fieldset className="rounded-[24px] border border-stone-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wider text-stone-500">Возражения родителя</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {trialObjectionOptions.map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-xs font-bold text-stone-600">
              <input type="checkbox" checked={selectedObjections.has(value)} disabled={disabled} onChange={() => toggleObjection(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <TrialTextarea label="Свободный комментарий преподавателя" value={raw.teacherFreeComment} disabled={disabled} onChange={(value) => updateSection("raw", { teacherFreeComment: value })} />
    </div>
  );
}

function TrialScore({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
      {label}
      <input
        type="number"
        min={1}
        max={5}
        step={1}
        value={value ?? ""}
        onChange={(event) => onChange(scoreFromInput(event.target.value))}
        disabled={disabled}
        className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
        placeholder="1-5"
      />
    </label>
  );
}

function TrialTextarea({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
      {label}
      <textarea
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
      />
    </label>
  );
}

function StudentRoster({
  students,
  canManageAttendance,
  canEdit,
  busy,
  studentsError,
  onRetryStudents,
  onUpdateAttendance,
}: {
  students: TeacherOfflineStudent[];
  canManageAttendance: boolean;
  canEdit: boolean;
  busy: string | null;
  studentsError: string | null;
  onRetryStudents: () => void;
  onUpdateAttendance: (studentId: string, attendanceStatus: string, teacherNote?: string) => Promise<void>;
}) {
  return (
    <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
      <h2 className="font-display text-3xl">Ученики на уроке</h2>
      <p className="mt-2 text-sm text-stone-500">
        {canManageAttendance
          ? "Отметьте посещаемость. Списание с абонемента выполняет администратор в CRM."
          : "Список учеников на занятии. Посещаемость отмечает администратор после урока."}
      </p>

      {studentsError ? (
        <div className="mt-4"><ErrorState message={studentsError} retry={onRetryStudents} /></div>
      ) : null}

      {!students.length ? (
        <div className="mt-6">
          <EmptyState
            title="Список учеников пуст"
            description="Ученики появятся после записи в группу или назначения индивидуального урока."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {students.map((student) => (
            <div
              key={student.crmStudentId}
              className="rounded-2xl border border-stone-200 bg-white px-4 py-4"
            >
              {canManageAttendance ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold">{student.name}</p>
                    <select
                      value={student.attendanceStatus ?? "unmarked"}
                      disabled={!canEdit || busy != null}
                      onChange={(event) => void onUpdateAttendance(student.crmStudentId, event.target.value, student.teacherNote ?? undefined)}
                      className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
                    >
                      <option value="unmarked">Не отмечен</option>
                      <option value="present">Присутствовал</option>
                      <option value="late">Опоздал</option>
                      <option value="excused_absence">Отсутствовал по уважительной причине</option>
                      <option value="unexcused_absence">Отсутствовал без причины</option>
                    </select>
                  </div>
                  <textarea
                    defaultValue={student.teacherNote ?? ""}
                    disabled={!canEdit || busy != null}
                    onBlur={(event) => void onUpdateAttendance(
                      student.crmStudentId,
                      student.attendanceStatus ?? "unmarked",
                      event.target.value.trim() || undefined,
                    )}
                    className="mt-3 min-h-16 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                    placeholder="Заметка по ученику"
                  />
                </>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">{student.name}</p>
                  <span
                    className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
                      attendanceClasses[student.attendanceStatus ?? "unmarked"] ?? attendanceClasses.unmarked
                    }`}
                  >
                    {attendanceLabels[student.attendanceStatus ?? "unmarked"] ?? attendanceLabels.unmarked}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
