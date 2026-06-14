"use client";

import { CheckCircle2, LoaderCircle, Send, Play, XCircle, ShieldCheck } from "lucide-react";
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
import type { TeacherOfflineStudent } from "@/types/teacher-offline";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lesson = lessonResource.data;
  const students = studentsResource.data?.students ?? [];
  const canEditTeacherReport = !isAdmin && lesson && !["completed", "cancelled", "pending_admin_review"].includes(lesson.status);
  const canEditAdminReview = isAdmin && lesson?.status === "pending_admin_review";
  const canEditReport = Boolean(canEditTeacherReport || canEditAdminReview);
  const canApprove = isAdmin && lesson?.status === "pending_admin_review";
  const unmarkedCount = students.filter((student) => (student.attendanceStatus ?? "unmarked") === "unmarked").length;

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
  }, [lesson]);

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
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось выполнить действие");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction("submit", () =>
      teacherOfflineApi.submit(crmClassId, {
        topic: topic.trim(),
        lessonGoals: lessonGoals.trim() || undefined,
        lessonSummary: lessonSummary.trim(),
        homeworkDraft: homework.trim(),
        nextLessonFocus: nextLessonFocus.trim() || undefined,
        materials: materialsText
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url) => ({ type: "link", url, title: url })),
        comment: comment.trim() || undefined,
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
    if (unmarkedCount > 0) {
      setError(`Отметьте посещаемость у всех учеников (осталось: ${unmarkedCount})`);
      return;
    }
    await runAction("approve", () =>
      adminOfflineApi.approve(crmClassId, {
        deduct: true,
        topic: topic.trim() || undefined,
        lessonGoals: lessonGoals.trim() || undefined,
        lessonSummary: lessonSummary.trim() || undefined,
        homeworkDraft: homework.trim() || undefined,
        nextLessonFocus: nextLessonFocus.trim() || undefined,
        teacherComment: comment.trim() || undefined,
        materials: materialsText
          .split("\n")
          .map((url) => url.trim())
          .filter(Boolean)
          .map((url) => ({ type: "link", url, title: url })),
      }),
    );
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

      {error ? (
        <p className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-7 xl:grid-cols-[1fr_420px]">
        <section className="space-y-7">
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-3xl">Отчёт по уроку</h2>
            <p className="mt-2 text-sm text-stone-500">
              {isAdmin
                ? "Проверьте отчёт преподавателя, при необходимости отредактируйте и подтвердите урок."
                : "Заполните тему, итог и домашнее задание. Ученик увидит материалы после подтверждения администратором."}
            </p>

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
                  disabled={!canEditTeacherReport || busy != null || !topic.trim() || !lessonSummary.trim()}
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

        <aside className="space-y-4">
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
              onClick={() => void runAction("not-held", () => teacherOfflineApi.notHeld(crmClassId, comment.trim() || undefined))}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800 disabled:opacity-50"
            >
              {busy === "not-held" ? <LoaderCircle className="animate-spin" size={16} /> : <XCircle size={16} />}
              Урок не состоялся
            </button>
          ) : null}

          {canApprove ? (
            <button
              disabled={busy != null || !topic.trim() || !lessonSummary.trim()}
              onClick={() => void handleApprove()}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-700 px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "approve" ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              Подтвердить урок
            </button>
          ) : null}

          {canApprove && unmarkedCount > 0 ? (
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

      <SuccessModal
        open={Boolean(success)}
        title={success ?? ""}
        description="Данные сохранены в CRM."
        onClose={() => setSuccess(null)}
      />
    </>
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
