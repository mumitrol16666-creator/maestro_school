"use client";

import { ArrowLeft, CheckCircle2, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { formatFio } from "@/lib/name";
import { onlineLessonStatusClasses, onlineLessonStatusLabels } from "@/lib/online-lessons-ui";
import { StudentPhoneLine, WhatsAppLink } from "@/components/whatsapp-link";
import { onlineLessonsApi } from "@/lib/online-lessons-api";

export default function AdminOnlineLessonDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const resource = useApiResource(() => onlineLessonsApi.adminGet(requestId), [requestId]);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scheduledAt, setScheduledAt] = useState("");
  const [zoomUrl, setZoomUrl] = useState("");

  const [coveredTopics, setCoveredTopics] = useState("");
  const [whatWorked, setWhatWorked] = useState("");
  const [whatToImprove, setWhatToImprove] = useState("");
  const [completionComment, setCompletionComment] = useState("");
  const [lessonPoints, setLessonPoints] = useState(0);
  const [lessonCoins, setLessonCoins] = useState(0);
  const [lessonCoinsReason, setLessonCoinsReason] = useState("");
  const [createAssignment, setCreateAssignment] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState("Домашнее задание");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [assignmentFormat, setAssignmentFormat] = useState<"text" | "video" | "audio" | "file">("text");
  const [assignmentPoints, setAssignmentPoints] = useState(0);

  const [reviewComment, setReviewComment] = useState("");
  const [reviewPoints, setReviewPoints] = useState(0);
  const [reviewCoins, setReviewCoins] = useState(0);
  const [reviewCoinsReason, setReviewCoinsReason] = useState("");

  async function runAction(action: () => Promise<void>) {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось выполнить действие");
    } finally {
      setActing(false);
    }
  }

  if (resource.loading) return <LoadingState label="Открываем заявку" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Заявка не найдена" description="Возможно, она была удалена." />;

  const item = resource.data;
  const studentName = formatFio(item.student);
  const pendingSubmission = item.assignment?.submissions.find((sub) => sub.status === "submitted") ?? null;

  return (
    <>
      <Link href="/admin/online-lessons" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} /> К очереди онлайн-уроков
      </Link>

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Заявка на онлайн-урок</p>
            <h1 className="font-display mt-2 text-4xl">{studentName}</h1>
            <div className="mt-3">
              <StudentPhoneLine
                phone={item.student.phone}
                login={item.student.login}
                email={item.student.email}
              />
            </div>
            <div className="mt-4">
              <WhatsAppLink phone={item.student.phone} label="Написать в WhatsApp" />
            </div>
          </div>
          <span className={`rounded-full px-4 py-2 text-xs font-bold ${onlineLessonStatusClasses[item.status]}`}>
            {onlineLessonStatusLabels[item.status]}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Info label="Направление" value={item.directionTitle} />
          <Info label="Уровень" value={item.level} />
          <Info label="Удобное время" value={item.preferredTime} />
          <Info label="Создана" value={new Intl.DateTimeFormat("ru-RU").format(new Date(item.createdAt))} />
        </div>
        {item.comment && <p className="mt-6 rounded-2xl bg-stone-50 p-4 text-sm leading-7 text-stone-600">{item.comment}</p>}

        {message && <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p>}
        {error && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {item.status === "new" && (
            <button disabled={acting} onClick={() => void runAction(async () => {
              await onlineLessonsApi.assign(requestId);
              setMessage("Заявка взята в работу и перемещена в «Уроки в работе».");
            })} className={primaryButton}>Взять заявку</button>
          )}
          {(item.status === "new" || item.status === "assigned") && (
            <button disabled={acting} onClick={() => void runAction(async () => {
              await onlineLessonsApi.cancel(requestId);
              setMessage("Заявка отменена.");
            })} className={secondaryButton}>Отменить</button>
          )}
          {item.status === "scheduled" && (
            <button disabled={acting} onClick={() => void runAction(async () => {
              await onlineLessonsApi.noShow(requestId);
              setMessage("Отмечена неявка ученика.");
            })} className={secondaryButton}>Неявка</button>
          )}
        </div>
      </section>

      {["new", "assigned", "scheduled"].includes(item.status) && (
        <section className="mt-6 rounded-[28px] border border-stone-200 bg-white p-6">
          <h2 className="font-display text-2xl">Назначить урок</h2>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void runAction(async () => {
                await onlineLessonsApi.schedule(requestId, { scheduledAt: new Date(scheduledAt).toISOString(), zoomUrl });
                setMessage("Урок назначен. Ученик увидит дату и Zoom-ссылку.");
              });
            }}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Дата и время
              <input type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={`${inputClass} mt-2`} />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 sm:col-span-2">
              Zoom-ссылка
              <input type="url" required value={zoomUrl} onChange={(e) => setZoomUrl(e.target.value)} className={`${inputClass} mt-2`} placeholder="https://zoom.us/j/..." />
            </label>
            <button disabled={acting} className={`${primaryButton} sm:col-span-2`}>Сохранить расписание</button>
          </form>
        </section>
      )}

      {["assigned", "scheduled"].includes(item.status) && (
        <section className="mt-6 rounded-[28px] border border-stone-200 bg-white p-6">
          <h2 className="font-display text-2xl">Завершить урок</h2>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void runAction(async () => {
                await onlineLessonsApi.complete(requestId, {
                  coveredTopics,
                  whatWorked,
                  whatToImprove,
                  completionComment: completionComment || undefined,
                  lessonPoints,
                  lessonCoins,
                  lessonCoinsReason: lessonCoins > 0 ? lessonCoinsReason : undefined,
                  createAssignment,
                  assignment: createAssignment ? {
                    title: assignmentTitle,
                    description: assignmentDescription,
                    dueAt: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
                    submissionFormat: assignmentFormat,
                    pointsReward: assignmentPoints,
                  } : undefined,
                });
                setMessage("Урок завершён. Ученик увидит итоги и домашнее задание.");
              });
            }}
            className="mt-4 space-y-4"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Что проходили
              <textarea required value={coveredTopics} onChange={(e) => setCoveredTopics(e.target.value)} className={`${inputClass} mt-2 min-h-24`} />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Что получилось
              <textarea required value={whatWorked} onChange={(e) => setWhatWorked(e.target.value)} className={`${inputClass} mt-2 min-h-24`} />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Что доработать
              <textarea required value={whatToImprove} onChange={(e) => setWhatToImprove(e.target.value)} className={`${inputClass} mt-2 min-h-24`} />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий преподавателя
              <textarea value={completionComment} onChange={(e) => setCompletionComment(e.target.value)} className={`${inputClass} mt-2 min-h-20`} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Баллы за урок
                <input type="number" min="0" value={lessonPoints} onChange={(e) => setLessonPoints(Number(e.target.value))} className={`${inputClass} mt-2`} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Maestro Coins (необязательно)
                <input type="number" min="0" value={lessonCoins} onChange={(e) => setLessonCoins(Number(e.target.value))} className={`${inputClass} mt-2`} />
              </label>
            </div>
            {lessonCoins > 0 && (
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Причина начисления Coins
                <input required value={lessonCoinsReason} onChange={(e) => setLessonCoinsReason(e.target.value)} className={`${inputClass} mt-2`} />
              </label>
            )}

            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 p-4">
              <input type="checkbox" checked={createAssignment} onChange={(e) => setCreateAssignment(e.target.checked)} />
              <span className="text-sm font-bold">Создать домашнее задание</span>
            </label>

            {createAssignment && (
              <div className="space-y-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <input value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} className={inputClass} placeholder="Название" />
                <textarea value={assignmentDescription} onChange={(e) => setAssignmentDescription(e.target.value)} className={`${inputClass} min-h-28`} placeholder="Описание задания" required />
                <input type="datetime-local" value={assignmentDueAt} onChange={(e) => setAssignmentDueAt(e.target.value)} className={inputClass} />
                <select value={assignmentFormat} onChange={(e) => setAssignmentFormat(e.target.value as typeof assignmentFormat)} className={inputClass}>
                  <option value="text">Текст</option>
                  <option value="video">Видео</option>
                  <option value="audio">Аудио</option>
                  <option value="file">Файл (ссылка)</option>
                </select>
                <input type="number" min="0" value={assignmentPoints} onChange={(e) => setAssignmentPoints(Number(e.target.value))} className={inputClass} placeholder="Баллы за выполнение" />
              </div>
            )}

            <button disabled={acting} className={primaryButton}>
              {acting ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Завершить урок
            </button>
          </form>
        </section>
      )}

      {pendingSubmission && (
        <section className="mt-6 rounded-[28px] border border-stone-200 bg-white p-6">
          <h2 className="font-display text-2xl">Проверка домашнего задания</h2>
          <p className="mt-3 text-sm text-stone-600">{pendingSubmission.comment || "Без комментария"}</p>
          {pendingSubmission.attachmentUrl && (
            <a href={pendingSubmission.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-gold hover:underline">
              Открыть материал
            </a>
          )}

          <div className="mt-4 space-y-4">
            <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} className={`${inputClass} min-h-24`} placeholder="Комментарий преподавателя" />
            <div className="grid gap-4 sm:grid-cols-2">
              <input type="number" min="0" value={reviewPoints} onChange={(e) => setReviewPoints(Number(e.target.value))} className={inputClass} placeholder="Баллы за ДЗ" />
              <input type="number" min="0" value={reviewCoins} onChange={(e) => setReviewCoins(Number(e.target.value))} className={inputClass} placeholder="Maestro Coins" />
            </div>
            {reviewCoins > 0 && (
              <input required value={reviewCoinsReason} onChange={(e) => setReviewCoinsReason(e.target.value)} className={inputClass} placeholder="Причина начисления Coins" />
            )}
            <div className="flex flex-wrap gap-2">
              {(["approve", "approve_with_remarks", "return"] as const).map((action) => (
                <button
                  key={action}
                  disabled={acting}
                  onClick={() => void runAction(async () => {
                    await onlineLessonsApi.reviewSubmission(pendingSubmission.id, {
                      action,
                      reviewComment: reviewComment || undefined,
                      reviewPoints,
                      reviewCoins,
                      reviewCoinsReason: reviewCoins > 0 ? reviewCoinsReason : undefined,
                    });
                    setMessage(action === "return" ? "Задание возвращено на доработку." : "Задание проверено.");
                  })}
                  className={action === "return" ? secondaryButton : primaryButton}
                >
                  {action === "approve" ? "Принять" : action === "approve_with_remarks" ? "Принять с замечаниями" : <><RotateCcw size={14} /> На доработку</>}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-700">{value}</p>
    </div>
  );
}
