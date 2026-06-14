"use client";

import { CheckCircle2, LoaderCircle, Send, Play, XCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { SuccessModal } from "@/components/success-modal";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { teacherOfflineApi } from "@/lib/teacher-offline-api";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  cancelled: "Отменён",
};

export default function AdminOfflineLessonDetailPage() {
  const params = useParams<{ crmClassId: string }>();
  const crmClassId = params.crmClassId;

  const lessonResource = useApiResource(() => teacherOfflineApi.classCard(crmClassId), [crmClassId]);
  const studentsResource = useApiResource(() => teacherOfflineApi.students(crmClassId), [crmClassId]);

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
  const canEdit = lesson && !["completed", "cancelled", "pending_admin_review"].includes(lesson.status);

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
    await runAction(`attendance-${studentId}`, () =>
      teacherOfflineApi.attendance(crmClassId, studentId, attendanceStatus, teacherNote),
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
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <h2 className="font-display text-3xl">Посещаемость</h2>
            <p className="mt-2 text-sm text-stone-500">Отметьте присутствующих. Списание с абонемента выполняет только администратор.</p>

            {studentsResource.error ? (
              <div className="mt-4"><ErrorState message={studentsResource.error} retry={studentsResource.reload} /></div>
            ) : null}

            {!students.length ? (
              <div className="mt-6"><EmptyState title="Список учеников пуст" description="Ученики появятся после записи в группу или назначения индивидуального урока." /></div>
            ) : (
              <div className="mt-6 space-y-3">
                {students.map((student) => (
                  <div
                    key={student.crmStudentId}
                    className="rounded-2xl border border-stone-200 bg-white px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-semibold">{student.name}</p>
                      <select
                        value={student.attendanceStatus ?? "unmarked"}
                        disabled={!canEdit || busy != null}
                        onChange={(event) => void updateAttendance(student.crmStudentId, event.target.value, student.teacherNote ?? undefined)}
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
                      onBlur={(event) => void updateAttendance(
                        student.crmStudentId,
                        student.attendanceStatus ?? "unmarked",
                        event.target.value.trim() || undefined,
                      )}
                      className="mt-3 min-h-16 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                      placeholder="Короткая заметка по ученику: успехи, сложности, рекомендации"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-3xl">Отчёт по уроку</h2>
            <p className="mt-2 text-sm text-stone-500">Тема и ДЗ увидит ученик после подтверждения администратором.</p>

            <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Тема урока
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Что проходили на занятии?"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Цель урока
              <textarea
                value={lessonGoals}
                onChange={(event) => setLessonGoals(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Что планировали освоить?"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Итог урока
              <textarea
                value={lessonSummary}
                onChange={(event) => setLessonSummary(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Что получилось, что разобрали, какой результат?"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Домашнее задание
              <textarea
                value={homework}
                onChange={(event) => setHomework(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-32 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Что отработать до следующего урока?"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Фокус следующего урока
              <textarea
                value={nextLessonFocus}
                onChange={(event) => setNextLessonFocus(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="С чего продолжить на следующем занятии?"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Материалы и ссылки
              <textarea
                value={materialsText}
                onChange={(event) => setMaterialsText(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Одна ссылка на строку"
              />
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий для админа
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={!canEdit}
                className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canEdit || busy != null || !topic.trim() || !lessonSummary.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === "submit" ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                Отправить на подтверждение
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          {lesson.status === "scheduled" ? (
            <button
              disabled={busy != null}
              onClick={() => void runAction("start", () => teacherOfflineApi.start(crmClassId))}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-700 px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === "start" ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />}
              Начать урок
            </button>
          ) : null}

          {canEdit ? (
            <button
              disabled={busy != null}
              onClick={() => void runAction("not-held", () => teacherOfflineApi.notHeld(crmClassId, comment.trim() || undefined))}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800 disabled:opacity-50"
            >
              {busy === "not-held" ? <LoaderCircle className="animate-spin" size={16} /> : <XCircle size={16} />}
              Урок не состоялся
            </button>
          ) : null}

          {lesson.status === "pending_admin_review" ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
                <CheckCircle2 size={16} />
                Отправлено на проверку
              </p>
              <p className="mt-2 text-sm text-amber-800/80">Администратор подтвердит урок и опубликует ДЗ ученику.</p>
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
