"use client";

import { Check, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cmsApi } from "@/lib/cms-api";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import type {
  LegacyTrialLessonReport,
  TrialDiagnosticBlock,
  TrialDiagnosticLevel,
  TrialLessonReport,
  TrialPlanStep,
} from "@/types/teacher-offline";
import type { SectorTemplate } from "@/types/teacher-students";

/**
 * The trial lesson in the app (decision 03.11, document 23 §8, §10). Built on the school methodology
 * «Путь Maestro — Работа с учеником»: p.48 — diagnostics through four short musical actions,
 * «для выбора входа, а не для распределения детей на сильных и слабых»; p.25 — the family hears one
 * learned skill, one current difficulty and one home action. The teacher is asked only what reaches
 * the family sheet or opens the first sector: four levels, three lines, the start step; the goal
 * and the frequency are optional.
 */
export const TRIAL_BLOCKS: Array<{ key: TrialDiagnosticBlock; title: string; hint: string }> = [
  { key: "instrument", title: "Инструмент", hint: "Посадка, положение рук, может ли расслабить плечи." },
  { key: "hearingPulse", title: "Слух и пульс", hint: "Повторить два звука, различить высокий и низкий, повторить короткий ритм." },
  { key: "movement", title: "Движение", hint: "Первый звук на инструменте, одно простое движение." },
  { key: "learnability", title: "Обучаемость", hint: "После короткой подсказки следующая попытка лучше?" },
];

export const TRIAL_LEVELS: Array<{ key: TrialDiagnosticLevel; title: string }> = [
  { key: "not_yet", title: "Пока не получилось" },
  { key: "with_hint", title: "С подсказкой" },
  { key: "independent", title: "Сам" },
];

export const TRIAL_FREQUENCIES: Array<{ key: TrialLessonReport["recommendation"]["recommendedFrequency"]; title: string }> = [
  { key: "1_per_week", title: "1 раз в неделю" },
  { key: "2_per_week", title: "2 раза в неделю" },
  { key: "3_per_week", title: "3 раза в неделю" },
];

export function emptyTrialReport(direction?: string | null): TrialLessonReport {
  return {
    version: 3,
    studentProfile: { direction: direction ?? undefined, goalAndSong: "" },
    diagnostics: {
      instrument: { level: null },
      hearingPulse: { level: null },
      movement: { level: null },
      learnability: { level: null },
    },
    lessonFacts: { achieved: "", difficulty: "", homeAction: "" },
    recommendation: { startStep: null, plan: [], recommendedFrequency: "undecided" },
  };
}

export function isTrialReportV3(report: unknown): report is TrialLessonReport {
  if (!report || typeof report !== "object") return false;
  const value = report as { version?: unknown; diagnostics?: unknown };
  return Number(value.version) === 3 || Boolean(value.diagnostics && typeof value.diagnostics === "object");
}

const frequencyKeys = new Set(TRIAL_FREQUENCIES.map((item) => item.key));

/** A saved v3 report or draft, reduced to the asked fields; an older report only gives the goal. */
export function mergeTrialReport(report?: unknown, direction?: string | null): TrialLessonReport {
  const base = emptyTrialReport(direction);
  if (isTrialReportV3(report)) {
    const frequency = report.recommendation?.recommendedFrequency;
    return {
      version: 3,
      capturedAt: report.capturedAt,
      studentProfile: {
        direction: report.studentProfile?.direction ?? base.studentProfile.direction,
        goalAndSong: report.studentProfile?.goalAndSong ?? "",
      },
      diagnostics: Object.fromEntries(TRIAL_BLOCKS.map(({ key }) => [
        key,
        { level: report.diagnostics?.[key]?.level ?? null },
      ])) as TrialLessonReport["diagnostics"],
      lessonFacts: { ...base.lessonFacts, ...(report.lessonFacts ?? {}) },
      recommendation: {
        startStep: report.recommendation?.startStep ?? null,
        plan: report.recommendation?.plan ?? [],
        recommendedFrequency: frequency && frequencyKeys.has(frequency) ? frequency : "undecided",
      },
    };
  }
  const legacy = (report ?? {}) as LegacyTrialLessonReport;
  const goal = legacy.studentProfile?.goalFromStudent || legacy.studentProfile?.goalFromParent || "";
  return { ...base, studentProfile: { ...base.studentProfile, goalAndSong: goal } };
}

/** What still blocks sending, per step of the trial lesson. */
export function trialReportIssues(report: TrialLessonReport, options: { stepsAvailable: boolean }) {
  const missingBlocks = TRIAL_BLOCKS.filter(({ key }) => !report.diagnostics[key]?.level).map(({ title }) => title);
  const facts = report.lessonFacts;
  const missingFacts = [
    !facts.achieved?.trim() ? "что получилось" : null,
    !facts.difficulty?.trim() ? "над чем поработаем" : null,
    !facts.homeAction?.trim() ? "что делать дома" : null,
  ].filter(Boolean);
  const diagnostics = missingBlocks.length
    ? `Отметьте, как получилось: ${missingBlocks.join(", ")}.`
    : missingFacts.length
      ? `Заполните ${missingFacts.join(", ")}.`
      : null;
  const recommendation = options.stepsAvailable && !report.recommendation.startStep
    ? "Выберите ступень, с которой начнём."
    : null;
  return { diagnostics, recommendation, ready: !diagnostics && !recommendation };
}

const labelClass = "block text-xs font-bold uppercase tracking-wider text-stone-500";
const inputClass = "mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm";

function choiceClass(selected: boolean) {
  return `min-h-11 rounded-2xl border px-3 py-2 text-sm font-bold transition ${
    selected ? "border-ink bg-ink text-white" : "border-stone-200 bg-white text-stone-700 hover:border-gold"
  }`;
}

type Update = (next: (report: TrialLessonReport) => TrialLessonReport) => void;

/** Step «Диагностика»: the optional goal, four levels and the three lines for the family. */
export function TrialDiagnostics({ report, update }: { report: TrialLessonReport; update: Update }) {
  const setFact = (key: keyof TrialLessonReport["lessonFacts"], value: string) =>
    update((current) => ({ ...current, lessonFacts: { ...current.lessonFacts, [key]: value } }));
  return (
    <div className="space-y-5" data-testid="trial-diagnostics">
      <label className={labelClass}>
        Цель и любимая песня (если назвал)
        <input
          value={report.studentProfile.goalAndSong ?? ""}
          maxLength={300}
          placeholder="Например: сыграть «Кукушку»"
          onChange={(event) => update((current) => ({
            ...current,
            studentProfile: { ...current.studentProfile, goalAndSong: event.target.value },
          }))}
          className={inputClass}
        />
      </label>
      <p className="text-sm leading-6 text-stone-600">
        Отметьте, как получилось каждое действие. Это нужно, чтобы выбрать, с чего начать, а не чтобы оценить ученика.
      </p>
      {TRIAL_BLOCKS.map((block) => {
        const level = report.diagnostics[block.key]?.level ?? null;
        return (
          <fieldset key={block.key} className="rounded-2xl border border-stone-200 bg-white p-4" data-testid={`trial-block-${block.key}`}>
            <legend className="px-1 text-base font-bold text-ink">{block.title}</legend>
            <p className="text-sm leading-6 text-stone-500">{block.hint}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {TRIAL_LEVELS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={level === option.key}
                  className={choiceClass(level === option.key)}
                  onClick={() => update((current) => ({
                    ...current,
                    diagnostics: { ...current.diagnostics, [block.key]: { level: option.key } },
                  }))}
                >
                  {level === option.key ? <Check size={14} className="mr-1 inline" /> : null}
                  {option.title}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      <div className="grid gap-4">
        <label className={labelClass}>
          Получилось — один освоенный навык
          <textarea rows={2} maxLength={300} value={report.lessonFacts.achieved ?? ""} onChange={(event) => setFact("achieved", event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Поработаем — одна трудность
          <textarea rows={2} maxLength={300} value={report.lessonFacts.difficulty ?? ""} onChange={(event) => setFact("difficulty", event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Дома — одно конкретное действие
          <textarea rows={2} maxLength={300} value={report.lessonFacts.homeAction ?? ""} onChange={(event) => setFact("homeAction", event.target.value)} className={inputClass} />
        </label>
      </div>
    </div>
  );
}

const normalizeDirection = (value?: string | null) => (value ?? "").trim().toLocaleLowerCase("ru");

/**
 * Published steps of the lead's own direction (exact title match: «Гитара» is not «Электрогитара»).
 * A start step is required only when its direction has steps; otherwise the report goes without a
 * plan (document 23 §8: «ступени направления ещё не заведены»).
 */
export function trialStepsForDirection(templates: SectorTemplate[] | null, direction?: string | null) {
  const wanted = normalizeDirection(direction);
  if (!templates || !wanted) return [];
  return templates
    .filter((template) => normalizeDirection(template.direction?.title) === wanted)
    .sort((a, b) => a.number - b.number);
}

function snapshot(template: SectorTemplate): TrialPlanStep {
  return {
    templateId: template.id,
    number: template.number,
    title: template.title,
    direction: template.direction?.title ?? null,
    topics: template.topics.map((topic) => topic.title).slice(0, 12),
  };
}

/** Published program steps the teacher (or the admin acting for the teacher) can start from. */
export function useTrialStepTemplates(enabled: boolean, asAdmin: boolean) {
  const [templates, setTemplates] = useState<SectorTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (asAdmin ? cmsApi.sectorTemplates() : teacherStudentsApi.sectorTemplates())
      .then((items) => { if (!cancelled) setTemplates(items.filter((item) => item.isPublished)); })
      .catch(() => { if (!cancelled) { setTemplates([]); setError("Не удалось загрузить ступени программы."); } });
    return () => { cancelled = true; };
  }, [enabled, asAdmin]);
  return { templates, error };
}

/** Step «План»: the start step (the plan for three months follows from it) and the optional frequency. */
export function TrialRecommendation({ report, update, templates, templatesError, direction }: {
  report: TrialLessonReport;
  update: Update;
  templates: SectorTemplate[] | null;
  templatesError: string | null;
  direction?: string | null;
}) {
  const steps = useMemo(() => trialStepsForDirection(templates, direction), [templates, direction]);

  function chooseStart(template: SectorTemplate) {
    const index = steps.findIndex((item) => item.id === template.id);
    const plan = steps.slice(index, index + 3).map(snapshot);
    const start = snapshot(template);
    update((current) => ({
      ...current,
      recommendation: { ...current.recommendation, startStep: { ...start, topics: undefined }, plan },
    }));
  }

  return (
    <div className="space-y-5" data-testid="trial-recommendation">
      <div>
        <p className={labelClass}>С какой ступени начнём</p>
        {templates === null ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-stone-500"><LoaderCircle size={15} className="animate-spin" /> Загружаем ступени программы…</p>
        ) : !steps.length ? (
          <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950" data-testid="trial-no-steps">
            {templatesError ?? `Для направления «${direction || "не указано"}» ступени программы ещё не заведены. План на три месяца не сформируется; отправить отчёт можно.`}
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {steps.map((template) => {
              const selected = report.recommendation.startStep?.templateId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseStart(template)}
                  className={`${choiceClass(selected)} text-left`}
                >
                  Ступень {template.number} · {template.title}
                </button>
              );
            })}
          </div>
        )}
        {report.recommendation.plan.length ? (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm" data-testid="trial-plan">
            <p className="font-bold text-emerald-950">План на три месяца</p>
            <ol className="mt-2 space-y-2">
              {report.recommendation.plan.map((step) => (
                <li key={`${step.templateId}-${step.number}`}>
                  <span className="font-semibold text-ink">Ступень {step.number} · {step.title}</span>
                  {step.topics?.length ? <span className="text-stone-600">: {step.topics.join(" · ")}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      <fieldset>
        <legend className={labelClass}>Рекомендуем заниматься (если уже понятно)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TRIAL_FREQUENCIES.map((option) => {
            const selected = report.recommendation.recommendedFrequency === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                className={choiceClass(selected)}
                onClick={() => update((current) => ({
                  ...current,
                  recommendation: { ...current.recommendation, recommendedFrequency: selected ? "undecided" : option.key },
                }))}
              >
                {option.title}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/** The report as the preview and the admin see it — the same parts as the family sheet. */
export function TrialReportSummary({ report }: { report: TrialLessonReport }) {
  const levelTitle = (level: TrialDiagnosticLevel | null | undefined) => TRIAL_LEVELS.find((item) => item.key === level)?.title ?? "—";
  const frequency = TRIAL_FREQUENCIES.find((item) => item.key === report.recommendation.recommendedFrequency)?.title;
  const rows: Array<[string, string | undefined]> = [
    ["Цель", report.studentProfile.goalAndSong],
    ["Получилось", report.lessonFacts.achieved],
    ["Поработаем", report.lessonFacts.difficulty],
    ["Дома", report.lessonFacts.homeAction],
    ["С чего начнём", report.recommendation.startStep ? `Ступень ${report.recommendation.startStep.number} · ${report.recommendation.startStep.title}` : undefined],
    ["План на три месяца", report.recommendation.plan.map((step, index) => `${index + 1}-й месяц — Ступень ${step.number} · ${step.title}${step.topics?.length ? `: ${step.topics.join(" · ")}` : ""}`).join("\n") || undefined],
    ["Рекомендуем заниматься", frequency],
  ];
  return (
    <div className="space-y-4" data-testid="trial-summary">
      <dl className="grid gap-2 sm:grid-cols-2">
        {TRIAL_BLOCKS.map((block) => (
          <div key={block.key} className="rounded-2xl border border-stone-200 bg-white p-3">
            <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">{block.title}</dt>
            <dd className="mt-1 text-sm font-bold text-ink">{levelTitle(report.diagnostics[block.key]?.level)}</dd>
          </div>
        ))}
      </dl>
      <dl className="space-y-2">
        {rows.filter(([, value]) => value?.trim()).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * «Лист первого занятия» (document 23, step 2): CRM renders the A4 sheet from the submitted report,
 * the app opens it in a new window and calls print. The window opens on the click itself so the
 * browser does not block it while the sheet loads.
 */
export function TrialSheetPrintButton({ load }: { load: () => Promise<{ html: string }> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function print() {
    setError(null);
    const tab = window.open("", "_blank");
    if (!tab) {
      setError("Разрешите браузеру открыть новое окно с листом.");
      return;
    }
    tab.opener = null;
    setBusy(true);
    try {
      const sheet = await load();
      tab.document.open();
      tab.document.write(sheet.html);
      tab.document.close();
      tab.focus();
      tab.print();
    } catch (cause) {
      tab.close();
      setError(cause instanceof Error ? cause.message : "Не удалось открыть лист первого занятия.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void print()}
        disabled={busy}
        data-testid="trial-sheet-print"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Printer size={16} />}
        Распечатать лист первого занятия
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
