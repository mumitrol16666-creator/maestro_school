"use client";

import { BookOpenText, BookPlus, CalendarDays, Check, LoaderCircle, Users, X } from "lucide-react";
import { useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import type { TeacherLearningHomeworkAssignment } from "@/types/learning-homework";

function dueDateIso(value: string) {
  return value ? new Date(`${value}T23:59:00+05:00`).toISOString() : null;
}

function formatDueDate(value: string | null) {
  if (!value) return "Без срока";
  return `До ${new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(value))}`;
}

function recipientLabel(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return `${count} учеников`;
  if (remainder10 === 1) return `${count} ученик`;
  if (remainder10 >= 2 && remainder10 <= 4) return `${count} ученика`;
  return `${count} учеников`;
}

function assignmentStatus(assignment: TeacherLearningHomeworkAssignment) {
  const states = assignment.recipients.map((recipient) => recipient.state);
  if (states.length > 0 && states.every((state) => state === "accepted" || state === "accepted_with_comment")) {
    return "Принято всеми";
  }
  if (states.some((state) => state === "waiting_review")) return "Есть ответы на проверке";
  if (states.some((state) => state === "revision")) return "Есть доработки";
  return "Назначено";
}

export function LearningHomeworkAssignmentComposer({
  topicId,
  topicTitle,
}: {
  topicId: string;
  topicTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const assignmentsResource = useApiResource(
    () => learningHomeworkApi.teacherTopicAssignments(topicId),
    [topicId],
  );
  const assignments = assignmentsResource.data?.assignments ?? [];
  const latestAssignment = assignments[0] ?? null;

  async function submit() {
    if (!instructions.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const assignment = await learningHomeworkApi.createAssignment({
        topicId,
        instructions,
        dueAt: dueDateIso(dueDate),
        idempotencyKey: requestKey,
      });
      setSuccess(
        assignment.recipientCount === 1
          ? "Задание назначено ученику"
          : `Задание назначено: ${assignment.recipientCount} учеников`,
      );
      setInstructions("");
      setDueDate("");
      setRequestKey(crypto.randomUUID());
      setOpen(false);
      await assignmentsResource.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось назначить ДЗ");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setError(null);
              setSuccess(null);
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-950 transition hover:border-amber-300 hover:bg-amber-100"
          >
            <BookPlus size={14} />
            {latestAssignment ? "Дать ещё ДЗ" : "Дать ДЗ"}
          </button>
          {success ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-bold text-emerald-700">
              <Check size={13} className="shrink-0" />
              <span>{success}</span>
            </span>
          ) : null}
        </div>

        {assignmentsResource.loading && !latestAssignment ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <LoaderCircle size={13} className="animate-spin" />
            Загружаем выданное ДЗ…
          </p>
        ) : null}
        {assignmentsResource.error ? (
          <p className="text-xs font-semibold text-red-700">{assignmentsResource.error}</p>
        ) : null}
        {latestAssignment ? (
          <div className="min-w-0 border-l-2 border-emerald-300 pl-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-700">
                <BookOpenText size={13} />
                Последнее ДЗ
              </span>
              <span className="text-[11px] font-bold text-stone-500">
                {assignmentStatus(latestAssignment)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-stone-800">
              {latestAssignment.instructions}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-stone-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={13} className="text-gold" />
                {formatDueDate(latestAssignment.dueAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={13} className="text-gold" />
                {recipientLabel(latestAssignment.recipientCount)}
              </span>
              {assignments.length > 1 ? <span>Всего по теме: {assignments.length}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2 border-t border-stone-100 pt-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-xs font-black text-stone-800">ДЗ по теме «{topicTitle}»</p>
        <button
          type="button"
          title="Закрыть форму"
          aria-label="Закрыть форму домашнего задания"
          onClick={() => setOpen(false)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
      <textarea
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        rows={3}
        maxLength={10_000}
        placeholder="Что подготовить к следующему уроку"
        className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-[10px] font-black uppercase text-stone-500">
          Срок необязателен
          <span className="relative mt-1 block">
            <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-10 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-sm font-semibold normal-case outline-none focus:border-amber-400"
            />
          </span>
        </label>
        <button
          type="button"
          disabled={saving || !instructions.trim()}
          onClick={() => void submit()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-45"
        >
          {saving ? <LoaderCircle size={15} className="animate-spin" /> : <BookPlus size={15} />}
          {saving ? "Назначаем…" : "Назначить"}
        </button>
      </div>
      {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
