"use client";

import { Flag, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

const MAX_POINTS = 250;

/**
 * Decision 19.10: the teacher may close the open sector before every topic is
 * done and writes how many Points it is worth, from 0 to 250.
 */
export function SectorEarlyClose({
  crmStudentId,
  crmDirectionId,
  sequence,
  completed,
  total,
  onClosed,
}: {
  crmStudentId: string;
  crmDirectionId: string;
  sequence: number;
  completed: number;
  total: number;
  onClosed: (awardedPoints: number) => void;
}) {
  const suggested = total ? Math.round((MAX_POINTS * completed) / total) : 0;
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(String(suggested));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(points);
  const valid = points.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= MAX_POINTS;

  async function close() {
    if (!valid || busy) return;
    if (!window.confirm(`Закрыть сектор ${sequence} и начислить ${value} баллов? Отменить это нельзя.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await teacherStudentsApi.closeSectorEarly(crmStudentId, {
        crmDirectionId,
        points: value,
        comment: comment.trim() || null,
      });
      setOpen(false);
      onClosed(result.awardedPoints);
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
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-9 items-center rounded-lg border border-stone-200 px-3 text-xs font-bold text-stone-700"
        >
          {open ? "Скрыть" : "Закрыть досрочно"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-3">
          <p className="text-xs leading-5 text-stone-500">
            Закрыто тем: {completed} из {total}. Полный сектор стоит {MAX_POINTS} баллов; впишите, сколько начислить сейчас. Можно 0.
          </p>
          <label className="text-xs font-bold text-stone-600">
            Баллы за сектор
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_POINTS}
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              aria-label="Баллы за досрочное закрытие"
              className="mt-1 block h-11 w-32 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-ink"
            />
          </label>
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
          {!valid ? <p className="text-xs font-semibold text-red-700">Целое число от 0 до {MAX_POINTS}.</p> : null}
          {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void close()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Flag size={15} />}
            Закрыть сектор {sequence} за {valid ? value : "…"} баллов
          </button>
        </div>
      ) : null}
    </div>
  );
}
