"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";

/**
 * The lesson report as five short steps (02 §3.4): context and past work,
 * attendance, topics and homework check, summary and new homework, preview
 * and submit. The page keeps every field mounted and only shows the step
 * the teacher is on, so the autosaved draft and the submit validation stay
 * untouched.
 */
export type LessonStep = 1 | 2 | 3 | 4 | 5;

export const lessonSteps: Array<{ key: LessonStep; title: string; short: string }> = [
  { key: 1, title: "Контекст и прошлые работы", short: "Контекст" },
  { key: 2, title: "Посещаемость", short: "Посещаемость" },
  { key: 3, title: "Темы и проверка", short: "Темы" },
  { key: 4, title: "Итог и новое ДЗ", short: "Итог и ДЗ" },
  { key: 5, title: "Предпросмотр и отправка", short: "Отправка" },
];

export function LessonStepper({
  step,
  issues,
  onSelect,
}: {
  step: LessonStep;
  /** Per-step blocking issue: shown as a warning dot and on the step itself. */
  issues: Partial<Record<LessonStep, string | null>>;
  onSelect: (step: LessonStep) => void;
}) {
  return (
    <nav aria-label="Шаги урока" className="mb-6 rounded-[24px] border border-stone-200 bg-white p-2" data-testid="lesson-stepper">
      <ol className="grid grid-cols-5 gap-1">
        {lessonSteps.map((item) => {
          const current = item.key === step;
          const done = item.key < step;
          const issue = issues[item.key];
          return (
            <li key={item.key}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(item.key)}
                className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center transition ${
                  current ? "bg-ink text-white" : done ? "bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "text-stone-500 hover:bg-stone-50"
                }`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${
                  current ? "bg-gold text-ink" : done ? (issue ? "bg-amber-200 text-amber-900" : "bg-emerald-600 text-white") : "bg-stone-100 text-stone-500"
                }`}>
                  {done && !issue ? <Check size={13} /> : item.key}
                </span>
                <span className="hidden text-[11px] font-bold leading-tight sm:block">{item.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 px-2 text-xs font-semibold text-stone-500">
        Шаг {step} из {lessonSteps.length}: {lessonSteps[step - 1]?.title}
        {issues[step] ? <span className="ml-2 text-amber-800">· {issues[step]}</span> : null}
      </p>
    </nav>
  );
}

export function LessonStepNav({
  step,
  nextIssue,
  onPrev,
  onNext,
}: {
  step: LessonStep;
  /** Set when the current step is not complete; the button then explains instead of advancing. */
  nextIssue: string | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (step === 5) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5" data-testid="lesson-step-nav">
      <button
        type="button"
        disabled={step === 1}
        onClick={onPrev}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700 disabled:opacity-40"
      >
        <ArrowLeft size={16} /> Назад
      </button>
      <div className="flex flex-col items-end gap-1">
        {nextIssue ? <span className="text-xs font-semibold text-amber-800">{nextIssue}</span> : null}
        <button
          type="button"
          onClick={onNext}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white"
        >
          {step === 4 ? "К предпросмотру" : "Далее"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function LessonReportPreview({
  attendance,
  topic,
  lessonSummary,
  homework,
  homeworkTopicTitle,
  topicUpdates,
  homeworkDecisions,
  xp,
  issue,
}: {
  attendance: { present: number; late: number; absent: number; unmarked: number };
  topic: string;
  lessonSummary: string;
  homework: string;
  homeworkTopicTitle: string | null;
  topicUpdates: Array<{ topicId: string; title: string; fromPercent: number | null; toPercent: number }>;
  homeworkDecisions: { accepted: number; notCompleted: number; pending: number };
  xp: { willAward: number; limited: number } | null;
  issue: string | null;
}) {
  const row = "flex flex-wrap items-start justify-between gap-2 py-3 text-sm";
  return (
    <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5" data-testid="lesson-report-preview">
      <p className="text-xs font-black uppercase tracking-wider text-stone-600">Что уйдёт на подтверждение</p>
      <dl className="mt-2 divide-y divide-stone-100">
        <div className={row}>
          <dt className="font-bold text-stone-700">Посещаемость</dt>
          <dd className="text-stone-600">
            {attendance.present} был{attendance.late ? `, ${attendance.late} опоздал` : ""}{attendance.absent ? `, ${attendance.absent} не был` : ""}
            {attendance.unmarked ? <span className="ml-2 font-bold text-amber-800">· не отмечено: {attendance.unmarked}</span> : null}
          </dd>
        </div>
        <div className={row}>
          <dt className="font-bold text-stone-700">Темы</dt>
          <dd className="text-right text-stone-600">
            {topicUpdates.length
              ? topicUpdates.map((update) => (
                  <span key={update.topicId} className="block">
                    {update.title}: {update.fromPercent ?? 0}% → <strong className={update.toPercent === 100 ? "text-emerald-700" : "text-ink"}>{update.toPercent}%</strong>
                  </span>
                ))
              : "Проценты тем не менялись"}
          </dd>
        </div>
        <div className={row}>
          <dt className="font-bold text-stone-700">Проверка ДЗ</dt>
          <dd className="text-stone-600">
            {homeworkDecisions.accepted + homeworkDecisions.notCompleted
              ? `выполнено ${homeworkDecisions.accepted}, не выполнено ${homeworkDecisions.notCompleted}`
              : "отметок нет"}
            {homeworkDecisions.pending ? <span className="ml-2 font-bold text-amber-800">· без отметки: {homeworkDecisions.pending}</span> : null}
          </dd>
        </div>
        <div className={row}>
          <dt className="font-bold text-stone-700">Тема урока</dt>
          <dd className="max-w-[60%] text-right text-stone-600">{topic.trim() || <span className="text-amber-800">не указана</span>}</dd>
        </div>
        <div className={row}>
          <dt className="font-bold text-stone-700">Итог</dt>
          <dd className="max-w-[60%] whitespace-pre-wrap text-right text-stone-600">{lessonSummary.trim() || <span className="text-amber-800">не заполнен</span>}</dd>
        </div>
        <div className={row}>
          <dt className="font-bold text-stone-700">Новое ДЗ</dt>
          <dd className="max-w-[60%] whitespace-pre-wrap text-right text-stone-600">
            {homework.trim() ? <>{homeworkTopicTitle ? <span className="block text-xs font-bold text-amber-900">{homeworkTopicTitle}</span> : null}{homework.trim()}</> : "без домашнего задания"}
          </dd>
        </div>
        {xp ? (
          <div className={row}>
            <dt className="font-bold text-stone-700">XP за посещение</dt>
            <dd className="text-stone-600">+{xp.willAward}{xp.limited ? ` · у ${xp.limited} лимит недели` : ""}</dd>
          </div>
        ) : null}
      </dl>
      {issue ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{issue}</p> : null}
    </section>
  );
}
