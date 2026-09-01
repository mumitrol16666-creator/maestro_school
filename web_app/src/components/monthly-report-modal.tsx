"use client";

import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDialogBehavior } from "@/hooks/use-dialog-behavior";
import { downloadMonthlyReportExcel } from "@/lib/monthly-report-excel";
import type { SchoolOfflineLesson, StudentOfflineSummary } from "@/types/school-offline";

function formatMonthTitle(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

function formatLessonFullDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return isoString;
  }
}

export function MonthlyReportModal({
  open,
  onClose,
  summary,
  initialMonth,
}: {
  open: boolean;
  onClose: () => void;
  summary: StudentOfflineSummary;
  initialMonth: string;
}) {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const dialogRef = useDialogBehavior(open, onClose);

  useEffect(() => {
    if (open) setSelectedMonth(initialMonth);
  }, [initialMonth, open]);

  if (!open) return null;

  const studentName = summary.profile?.name || "Ученик";
  const groupNames =
    summary.profile?.groups?.map((g) => g.name).filter(Boolean).join(", ") ||
    "Индивидуальное обучение";

  const lessons = (summary.lessonHistory || []).filter(
    (lesson) => lesson.status === "completed" && lesson.date.slice(0, 7) === selectedMonth,
  );

  const totalLessons = lessons.length;
  const totalPoints = lessons.reduce((sum, l) => sum + (Number(l.lessonPoints) || 0), 0);
  const attendanceTracked = lessons.filter((lesson) => lesson.attended !== null);
  const attendedLessons = attendanceTracked.filter((lesson) => lesson.attended).length;
  const attendancePercent = attendanceTracked.length
    ? Math.round((attendedLessons / attendanceTracked.length) * 100)
    : null;
  const planItems = summary.monthlyPlan?.items || [];
  const completedTopics = planItems.filter((i) => i.status === "completed");

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadExcel = () => {
    downloadMonthlyReportExcel(summary, selectedMonth);
  };

  const handleDownloadCsv = () => {
    const rows = [
      ["Дата", "Урок", "Преподаватель", "Тема", "Цели", "Что сделали", "Что доработать", "Домашнее задание", "Учебные баллы", "Темы плана"],
      ...lessons.map((lesson) => [
        formatLessonFullDate(lesson.date),
        lesson.title,
        lesson.teacherName || "",
        lesson.topic || "",
        lesson.lessonGoals || "",
        lesson.lessonSummary || "",
        lesson.nextLessonFocus || "",
        lesson.homework || "",
        lesson.lessonPoints ?? 0,
        (lesson.planTopicResults ?? [])
          .map((item) => `${item.title} — ${item.status === "completed" ? "освоено" : "в работе"}`)
          .join(", "),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `maestro-report-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 print:static print:inset-auto print:p-0">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm print:hidden"
        aria-label="Закрыть отчёт по фону"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-report-title"
        className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden overscroll-contain rounded-t-xl border border-stone-200 bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-xl print:max-h-none print:w-full print:rounded-none print:border-none print:shadow-none"
      >
        
        {/* Header bar (hidden on print) */}
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-4 sm:px-6 print:hidden">
          <div className="order-1 flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/15 text-gold">
              <FileSpreadsheet size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="monthly-report-title" className="text-base font-bold text-ink sm:text-lg">Отчёт об обучении</h2>
              <p className="text-xs text-stone-500">Музыкальная школа Maestro</p>
            </div>
          </div>

          <div className="order-3 flex w-full items-center sm:order-2 sm:w-auto">
            <input
              type="month"
              name="reportMonth"
              aria-label="Месяц отчёта"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-amber-200 sm:w-auto"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            data-dialog-initial-focus="true"
            className="order-2 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:order-3"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Printable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8 print:overflow-visible print:p-0">
          
          {/* School Header Banner */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6">
            <div>
              <div className="flex items-center gap-2 text-gold">
                <Sparkles size={18} />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Maestro School</span>
              </div>
              <h1 className="font-display mt-2 text-2xl font-bold text-ink sm:text-3xl">
                Отчёт за {formatMonthTitle(selectedMonth)}
              </h1>
              <p className="mt-1 text-sm font-semibold text-stone-600">
                Ученик: <strong className="text-ink">{studentName}</strong> · {groupNames}
              </p>
            </div>
            <div className="text-right text-xs text-stone-600 print:block">
              <p>Дата формирования: {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</p>
              <p className="mt-0.5 font-semibold text-emerald-800">✓ Подтверждено администратором</p>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <span className="flex items-center gap-1.5 text-xs font-bold text-stone-600">
                <BookOpen size={14} className="text-gold" /> Уроков проведено
              </span>
              <p className="font-display mt-2 text-2xl font-bold text-ink">{totalLessons}</p>
              <span className="text-[11px] text-stone-600">за {selectedMonth}</span>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <span className="flex items-center gap-1.5 text-xs font-bold text-stone-600">
                <Award size={14} className="text-emerald-600" /> Баллы за месяц
              </span>
              <p className="font-display mt-2 text-2xl font-bold text-emerald-700">+{totalPoints}</p>
              <span className="text-[11px] text-stone-600">учебные баллы</span>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <span className="flex items-center gap-1.5 text-xs font-bold text-stone-600">
                <CheckCircle2 size={14} className="text-violet-600" /> Темы плана
              </span>
              <p className="font-display mt-2 text-2xl font-bold text-ink">
                {completedTopics.length} <span className="text-sm font-normal text-stone-600">/ {planItems.length || "—"}</span>
              </p>
              <span className="text-[11px] text-stone-600">освоено тем</span>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <span className="flex items-center gap-1.5 text-xs font-bold text-stone-600">
                <Clock size={14} className="text-amber-600" /> Посещаемость
              </span>
              <p className="font-display mt-2 text-2xl font-bold text-ink">
                {attendancePercent !== null ? `${attendancePercent}%` : "—"}
              </p>
              <span className="text-[11px] text-stone-600">
                {attendancePercent !== null ? `${attendedLessons} из ${attendanceTracked.length}` : "нет отметок"}
              </span>
            </div>
          </div>

          {/* Monthly Plan Focus (if present) */}
          {summary.monthlyPlan && (summary.monthlyPlan.goal || summary.monthlyPlan.items.length > 0) && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-900">
                  🎯 Цель и программа месяца
                </h3>
                {summary.monthlyPlan.teacherName && (
                  <span className="text-xs font-semibold text-amber-800">
                    Преподаватель: {summary.monthlyPlan.teacherName}
                  </span>
                )}
              </div>
              {summary.monthlyPlan.goal && (
                <p className="mt-2 text-sm font-bold text-ink">{summary.monthlyPlan.goal}</p>
              )}
              {summary.monthlyPlan.items.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {summary.monthlyPlan.items.map((item) => (
                    <span
                      key={item.id}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
                        item.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "in_progress"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-white text-stone-600 border border-stone-200"
                      }`}
                    >
                      {item.status === "completed" && "✓ "}
                      {item.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lessons Chronicle */}
          <div className="mt-8">
            <h3 className="font-display text-lg font-bold text-ink">
              Хронология занятий и домашние задания
            </h3>

            {lessons.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
                За {formatMonthTitle(selectedMonth)} проведённых уроков пока нет.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {lessons.map((lesson, idx) => (
                  <article
                    key={lesson.crmClassId || idx}
                    className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition hover:border-stone-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-700">
                            {formatLessonFullDate(lesson.date)}
                          </span>
                          <span className="text-xs font-semibold text-stone-500">
                            {lesson.startTime && `${lesson.startTime} — ${lesson.endTime || ""}`}
                          </span>
                        </div>
                        <h4 className="mt-1.5 text-base font-bold text-ink">
                          {lesson.topic || lesson.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        {lesson.teacherName && (
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">
                            {lesson.teacherName}
                          </span>
                        )}
                        {lesson.lessonPoints ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                            +{lesson.lessonPoints} баллов
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                      {lesson.lessonSummary && (
                        <div className="rounded-xl bg-stone-50 p-3">
                          <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">
                            Что сделали на уроке:
                          </span>
                          <p className="mt-1 text-stone-800 leading-relaxed whitespace-pre-wrap">
                            {lesson.lessonSummary}
                          </p>
                        </div>
                      )}

                      {lesson.homework && (
                        <div className="rounded-xl bg-amber-50/60 p-3 border border-amber-100/80">
                          <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px]">
                            Домашнее задание:
                          </span>
                          <p className="mt-1 text-amber-950 leading-relaxed font-semibold whitespace-pre-wrap">
                            {lesson.homework}
                          </p>
                        </div>
                      )}

                      {lesson.nextLessonFocus && (
                        <div className="rounded-xl bg-stone-50 p-3">
                          <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">
                            Что доработать / фокус:
                          </span>
                          <p className="mt-1 text-stone-800 leading-relaxed whitespace-pre-wrap">
                            {lesson.nextLessonFocus}
                          </p>
                        </div>
                      )}

                      {lesson.planTopicResults && lesson.planTopicResults.length > 0 && (
                        <div className="rounded-xl bg-emerald-50/60 p-3 border border-emerald-100/80">
                          <span className="font-bold text-emerald-900 uppercase tracking-wider text-[10px]">
                            Освоенные темы плана:
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {lesson.planTopicResults.map((t) => (
                              <span
                                key={t.itemId}
                                className="rounded bg-white px-2 py-0.5 font-bold text-emerald-800 border border-emerald-200"
                              >
                                ✓ {t.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="mt-8 border-t border-stone-200 pt-5 text-center text-xs text-stone-600">
            <p>Музыкальная школа Maestro · г. Актобе · Документ сформирован автоматически из журнала школы</p>
          </div>

        </div>

        {/* Bottom Actions (hidden on print) */}
        <div className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50/80 px-6 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 sm:flex-row sm:items-center sm:justify-between sm:py-4 print:hidden">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            <FileText size={14} /> Скачать в формате CSV
          </button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-xs font-bold text-stone-800 transition hover:bg-stone-50"
            >
              <Printer size={14} />
              Распечатать
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ink px-5 text-xs font-bold text-white transition hover:bg-stone-800"
            >
              <Download size={14} />
              Скачать Excel (.xls)
            </button>
          </div>
        </div>

      </section>
    </div>
  );
}
