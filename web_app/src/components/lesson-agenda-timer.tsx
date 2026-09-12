"use client";

import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ListChecks,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type LessonAgendaItem = {
  id: string;
  title: string;
  durationMin?: number;
  completed: boolean;
};

export const defaultLessonAgenda: LessonAgendaItem[] = [
  { id: "1", title: "Разминка / распевка / настройка инструмента", durationMin: 10, completed: false },
  { id: "2", title: "Проверка домашнего задания и разбор ошибок", durationMin: 10, completed: false },
  { id: "3", title: "Разбор новой темы / практическая часть", durationMin: 20, completed: false },
  { id: "4", title: "Отработка материала и закрепление", durationMin: 10, completed: false },
  { id: "5", title: "Подведение итогов и выдача ДЗ", durationMin: 5, completed: false },
];

export function formatElapsedClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LessonAgendaTimer({
  agenda,
  onChangeAgenda,
  onApplySummary,
  startTime,
  endTime,
  disabled = false,
}: {
  agenda: LessonAgendaItem[];
  onChangeAgenda: (next: LessonAgendaItem[]) => void;
  onApplySummary?: (summaryText: string) => void;
  startTime?: string;
  endTime?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState<number | undefined>(undefined);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Timer ticker
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerRunning) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  // Scheduled lesson duration in minutes
  const scheduledMinutes = useMemo(() => {
    if (!startTime || !endTime) return 50;
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 50;
    const diff = (endH * 60 + endM) - (startH * 60 + startM);
    return diff > 0 ? diff : 50;
  }, [startTime, endTime]);

  const scheduledSeconds = scheduledMinutes * 60;
  const progressPercent = Math.min(100, Math.round((seconds / scheduledSeconds) * 100));
  const isOvertime = seconds > scheduledSeconds;

  const completedCount = agenda.filter((item) => item.completed).length;
  const totalCount = agenda.length;

  function toggleItem(id: string) {
    if (disabled) return;
    onChangeAgenda(
      agenda.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)),
    );
  }

  function removeItem(id: string) {
    if (disabled) return;
    onChangeAgenda(agenda.filter((item) => item.id !== id));
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || disabled) return;
    const newItem: LessonAgendaItem = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      durationMin: newDuration && newDuration > 0 ? newDuration : undefined,
      completed: false,
    };
    onChangeAgenda([...agenda, newItem]);
    setNewTitle("");
    setNewDuration(undefined);
  }

  function resetToDefault() {
    if (disabled) return;
    onChangeAgenda(defaultLessonAgenda);
  }

  function handleInsertIntoSummary() {
    if (!onApplySummary) return;
    const completedItems = agenda.filter((item) => item.completed);
    if (!completedItems.length) return;

    const lines = [
      "План урока выполнен:",
      ...completedItems.map((item) => `✔ ${item.title}`),
    ];
    onApplySummary(lines.join("\n"));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  }

  return (
    <section className="mb-7 overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-soft transition-all">
      {/* Header with Timer and Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 bg-gradient-to-r from-amber-50/50 via-white to-amber-50/20 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500 text-white shadow-sm">
            <ListChecks size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-bold text-stone-900">
                План и тайминг урока
              </h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-black text-amber-900">
                {completedCount} / {totalCount} выполнено
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Интерактивный сценарий занятия и контроль времени
            </p>
          </div>
        </div>

        {/* Timer Box */}
        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-1.5 ${
            timerRunning
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
              : seconds > 0
              ? "border-stone-200 bg-stone-50 text-stone-700"
              : "border-stone-200 bg-white text-stone-600"
          }`}>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${
                timerRunning ? "animate-pulse bg-emerald-600" : seconds > 0 ? "bg-amber-500" : "bg-stone-300"
              }`} />
              <Timer size={16} className={timerRunning ? "text-emerald-700" : "text-stone-400"} />
              <span className="font-mono text-base font-black tracking-wider">
                {formatElapsedClock(seconds)}
              </span>
            </div>
            {startTime && endTime ? (
              <span className="text-xs font-semibold text-stone-400">
                / {scheduledMinutes} мин
              </span>
            ) : null}

            <div className="flex items-center gap-1 pl-1">
              <button
                type="button"
                onClick={() => setTimerRunning(!timerRunning)}
                className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold transition ${
                  timerRunning
                    ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
                title={timerRunning ? "Пауза" : "Запустить таймер"}
                aria-label={timerRunning ? "Пауза" : "Запустить таймер"}
              >
                {timerRunning ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
              </button>
              {seconds > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setSeconds(0);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-100"
                  title="Сбросить таймер"
                  aria-label="Сбросить таймер"
                >
                  <RotateCcw size={12} />
                </button>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 transition hover:bg-stone-100"
            aria-label={isOpen ? "Свернуть" : "Развернуть"}
          >
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Progress line */}
      {seconds > 0 ? (
        <div className="h-1 w-full bg-stone-100">
          <div
            className={`h-full transition-all duration-300 ${
              isOvertime ? "bg-red-500" : "bg-emerald-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}

      {/* Body: Checklist */}
      {isOpen ? (
        <div className="p-5 sm:p-6">
          <div className="space-y-2.5">
            {agenda.map((item, index) => (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 transition select-none ${
                  item.completed
                    ? "border-emerald-200 bg-emerald-50/40 text-stone-600"
                    : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/20"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${
                      item.completed
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-stone-300 bg-white text-transparent group-hover:border-amber-400"
                    }`}
                  >
                    <Check size={14} className={item.completed ? "stroke-[3]" : ""} />
                  </span>

                  <span className="text-xs font-black text-stone-400">
                    {index + 1}.
                  </span>

                  <span
                    className={`text-sm font-bold transition ${
                      item.completed
                        ? "text-stone-500 line-through decoration-stone-400 decoration-2"
                        : "text-ink"
                    }`}
                  >
                    {item.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {item.durationMin ? (
                    <span className="flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                      <Clock size={11} className="text-stone-400" />
                      {item.durationMin} мин
                    </span>
                  ) : null}

                  {!disabled ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                      title="Удалить этап"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Add Item Form */}
          {!disabled ? (
            <form onSubmit={handleAddItem} className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="+ Добавить этап урока..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="h-10 min-w-48 flex-1 rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 text-sm font-medium text-ink placeholder:text-stone-400 focus:border-amber-400 focus:bg-white focus:outline-none"
              />
              <input
                type="number"
                placeholder="мин"
                min={1}
                max={120}
                value={newDuration ?? ""}
                onChange={(e) => setNewDuration(e.target.value ? Number(e.target.value) : undefined)}
                className="h-10 w-20 rounded-xl border border-stone-200 bg-stone-50/50 px-3 text-center text-sm font-medium text-ink placeholder:text-stone-400 focus:border-amber-400 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                <Plus size={15} /> Добавить
              </button>
            </form>
          ) : null}

          {/* Footer Actions */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {onApplySummary && completedCount > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleInsertIntoSummary}
                  className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                >
                  <Sparkles size={14} className="text-amber-600" />
                  {copiedNotification
                    ? "✓ Вставлено в итог урока!"
                    : "Сформировать итог урока из плана"}
                </button>
              ) : null}
            </div>

            {!disabled && (
              <button
                type="button"
                onClick={resetToDefault}
                className="text-xs font-semibold text-stone-400 hover:text-stone-600 hover:underline"
              >
                Вернуть стандартные этапы
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
