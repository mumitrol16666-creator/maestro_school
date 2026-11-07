"use client";

import { Flag, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { formatExamDate } from "@/lib/sector-exams-api";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

/**
 * 07.11: the teacher may close an open sector (the current one or the one waiting for its exam)
 * before the exam. No Points are paid for it: they are given only for a passed exam.
 * While an exam lesson is booked, only the administrator can cancel it in the CRM first.
 */
export function SectorEarlyClose({
  crmStudentId,
  crmDirectionId,
  planId,
  sequence,
  exam,
  onClosed,
}: {
  crmStudentId: string;
  crmDirectionId: string;
  planId: string;
  sequence: number;
  exam?: { status: string; scheduledAt: string | null } | null;
  onClosed: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booked = exam?.status === "scheduled" || exam?.status === "in_progress";

  async function close() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await teacherStudentsApi.closeSectorEarly(crmStudentId, {
        crmDirectionId,
        planId,
        points: 0,
        comment: comment.trim() || null,
      });
      setOpen(false);
      await onClosed();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось закрыть сектор");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4" data-testid="sector-early-close">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600">
          <Flag size={14} /> Закрыть сектор досрочно
        </p>
        {booked ? null : (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-200 px-3 text-xs font-bold text-stone-700"
          >
            {open ? "Скрыть" : "Закрыть досрочно"}
          </button>
        )}
      </div>
      {booked ? (
        <p className="mt-3 text-sm leading-6 text-stone-700" data-testid="sector-early-close-booked">
          На сектор {sequence} назначен экзамен{exam?.scheduledAt ? ` ${formatExamDate(exam.scheduledAt)}` : ""}. Отменить урок экзамена может администратор в CRM, после этого сектор можно закрыть.
        </p>
      ) : null}
      {open && !booked ? (
        <div className="mt-3 grid gap-3">
          <p className="text-sm leading-6 text-stone-700">
            Закрыть сектор {sequence} досрочно? Баллы за сектор не начисляются: их дают только за сданный экзамен. Отменить нельзя.
          </p>
          <label className="text-xs font-bold text-stone-600">
            Почему закрываем (необязательно)
            <input
              value={comment}
              maxLength={1000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Например: ученик переходит на другую программу"
              className="mt-1 block h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm"
            />
          </label>
          {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void close()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Flag size={15} />}
            Закрыть сектор {sequence} без баллов
          </button>
        </div>
      ) : null}
    </div>
  );
}
