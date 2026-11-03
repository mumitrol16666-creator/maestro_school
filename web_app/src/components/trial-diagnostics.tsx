"use client";

import { Check, LoaderCircle } from "lucide-react";
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
 * The trial lesson in the app (decision 03.11, document 23 §8), built on the school methodology
 * «Путь Maestro — Работа с учеником»: p.48 — diagnostics through four short musical actions,
 * «для выбора входа, а не для распределения детей на сильных и слабых»; p.25 — the parent hears
 * one learned skill, one current difficulty and one home action. No 1–5 scores.
 */
export const TRIAL_BLOCKS: Array<{ key: TrialDiagnosticBlock; title: string; hint: string }> = [
  {
    key: "instrument",
    title: "Инструмент",
    hint: "Посадка, размер гитары, ведущая рука; может ли расслабить плечи и сказать, если неудобно.",
  },
  {
    key: "hearingPulse",
    title: "Слух и пульс",
    hint: "Повторить два звука, различить высокий и низкий, пройти ровные шаги, повторить короткий ритм.",
  },
  {
    key: "movement",
    title: "Движение",
    hint: "Звук на открытой струне, один палец, движение правой руки на заглушённых струнах.",
  },
  {
    key: "learnability",
    title: "Обучаемость",
    hint: "Дайте короткую подсказку и посмотрите, меняется ли следующая попытка.",
  },
];

export const TRIAL_LEVELS: Array<{ key: TrialDiagnosticLevel; title: string }> = [
  { key: "not_yet", title: "Пока не получилось" },
  { key: "with_hint", title: "С подсказкой" },
  { key: "independent", title: "Сам" },
];

const formatLabels: Record<TrialLessonReport["recommendation"]["recommendedFormat"], string> = {
  undecided: "Пока не решили",
  individual: "Индивидуально",
  group: "В группе",
  hybrid: "Смешанный",
};
const frequencyLabels: Record<TrialLessonReport["recommendation"]["recommendedFrequency"], string> = {
  undecided: "Пока не решили",
  "1_per_week": "1 раз в неделю",
  "2_per_week": "2 раза в неделю",
  "3_per_week": "3 раза в неделю",
  custom: "Свой график",
};
const experienceLabels: Record<TrialLessonReport["studentProfile"]["priorExperience"], string> = {
  unknown: "Не выяснили",
  none: "С нуля",
  basic: "Немного играл",
  medium: "Играл уверенно",
  strong: "Играет хорошо",
};

export function emptyTrialReport(direction?: string | null): TrialLessonReport {
  return {
    version: 3,
    attendance: { arrivedWith: "unknown" },
    studentProfile: { direction: direction ?? undefined, priorExperience: "unknown", goalAndSong: "" },
    diagnostics: {
      instrument: { level: null, note: "" },
      hearingPulse: { level: null, note: "" },
      movement: { level: null, note: "" },
      learnability: { level: null, note: "" },
    },
    lessonFacts: { achieved: "", difficulty: "", homeAction: "" },
    recommendation: { startStep: null, plan: [], recommendedFormat: "undecided", recommendedFrequency: "undecided" },
    raw: { teacherNote: "" },
  };
}

export function isTrialReportV3(report: unknown): report is TrialLessonReport {
  if (!report || typeof report !== "object") return false;
  const value = report as { version?: unknown; diagnostics?: unknown };
  return Number(value.version) === 3 || Boolean(value.diagnostics && typeof value.diagnostics === "object");
}

/** A saved v3 report or draft as is; an older report only gives the goal and experience. */
export function mergeTrialReport(report?: unknown, direction?: string | null): TrialLessonReport {
  const base = emptyTrialReport(direction);
  if (isTrialReportV3(report)) {
    return {
      ...base,
      ...report,
      version: 3,
      attendance: { ...base.attendance, ...(report.attendance ?? {}) },
      studentProfile: { ...base.studentProfile, ...(report.studentProfile ?? {}) },
      diagnostics: Object.fromEntries(TRIAL_BLOCKS.map(({ key }) => [
        key,
        { ...base.diagnostics[key], ...(report.diagnostics?.[key] ?? {}) },
      ])) as TrialLessonReport["diagnostics"],
      lessonFacts: { ...base.lessonFacts, ...(report.lessonFacts ?? {}) },
      recommendation: { ...base.recommendation, ...(report.recommendation ?? {}) },
      raw: { ...base.raw, ...(report.raw ?? {}) },
    };
  }
  const legacy = (report ?? {}) as LegacyTrialLessonReport;
  const goal = legacy.studentProfile?.goalFromStudent || legacy.studentProfile?.goalFromParent || "";
  return {
    ...base,
    studentProfile: {
      ...base.studentProfile,
      priorExperience: legacy.studentProfile?.priorExperience ?? "unknown",
      goalAndSong: goal,
    },
  };
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

export type TrialLead = { name: string; phone?: string | null; direction?: string | null };

/** Step 1: who came and what they want. */
export function TrialBeforeLesson({ report, lead, disabled, update }: {
  report: TrialLessonReport;
  lead: TrialLead | null;
  disabled: boolean;
  update: Update;
}) {
  return (
    <div className="space-y-5" data-testid="trial-before-lesson">
      {lead ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-lg font-bold text-ink">{lead.name}</p>
          <p className="mt-1 text-sm text-stone-500">
            {[lead.direction, lead.phone].filter(Boolean).join(" · ") || "Пробный урок из заявки"}
          </p>
        </div>
      ) : null}
      <fieldset>
        <legend className={labelClass}>С кем пришёл</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {([["adult", "Со взрослым"], ["alone", "Сам"]] as const).map(([value, title]) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={report.attendance.arrivedWith === value}
              className={choiceClass(report.attendance.arrivedWith === value)}
              onClick={() => update((current) => ({ ...current, attendance: { arrivedWith: value } }))}
            >
              {title}
            </button>
          ))}
        </div>
      </fieldset>
      <label className={labelClass}>
        Опыт до пробного
        <select
          value={report.studentProfile.priorExperience}
          disabled={disabled}
          onChange={(event) => update((current) => ({
            ...current,
            studentProfile: { ...current.studentProfile, priorExperience: event.target.value as TrialLessonReport["studentProfile"]["priorExperience"] },
          }))}
          className={inputClass}
        >
          {Object.entries(experienceLabels).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        Цель и любимая песня
        <textarea
          value={report.studentProfile.goalAndSong ?? ""}
          disabled={disabled}
          maxLength={1000}
          rows={2}
          placeholder="Что хочет играть, какую песню — спросите в начале урока"
          onChange={(event) => update((current) => ({
            ...current,
            studentProfile: { ...current.studentProfile, goalAndSong: event.target.value },
          }))}
          className={inputClass}
        />
      </label>
    </div>
  );
}

/** Step 2: the four blocks and the parent report «навык, трудность, действие». */
export function TrialDiagnostics({ report, disabled, update }: {
  report: TrialLessonReport;
  disabled: boolean;
  update: Update;
}) {
  const setBlock = (key: TrialDiagnosticBlock, patch: Partial<TrialLessonReport["diagnostics"][TrialDiagnosticBlock]>) =>
    update((current) => ({
      ...current,
      diagnostics: { ...current.diagnostics, [key]: { ...current.diagnostics[key], ...patch } },
    }));
  const setFact = (key: keyof TrialLessonReport["lessonFacts"], value: string) =>
    update((current) => ({ ...current, lessonFacts: { ...current.lessonFacts, [key]: value } }));
  return (
    <div className="space-y-5" data-testid="trial-diagnostics">
      <p className="text-sm leading-6 text-stone-600">
        Диагностика нужна, чтобы выбрать, с чего начать, а не чтобы оценить ученика. Отметьте, как получилось каждое действие.
      </p>
      {TRIAL_BLOCKS.map((block) => {
        const value = report.diagnostics[block.key];
        return (
          <fieldset key={block.key} className="rounded-2xl border border-stone-200 bg-white p-4" data-testid={`trial-block-${block.key}`}>
            <legend className="px-1 text-base font-bold text-ink">{block.title}</legend>
            <p className="text-sm leading-6 text-stone-500">{block.hint}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {TRIAL_LEVELS.map((level) => (
                <button
                  key={level.key}
                  type="button"
                  disabled={disabled}
                  aria-pressed={value.level === level.key}
                  className={choiceClass(value.level === level.key)}
                  onClick={() => setBlock(block.key, { level: level.key })}
                >
                  {value.level === level.key ? <Check size={14} className="mr-1 inline" /> : null}
                  {level.title}
                </button>
              ))}
            </div>
            <input
              value={value.note ?? ""}
              disabled={disabled}
              maxLength={500}
              aria-label={`${block.title}: что делали`}
              placeholder="Что делали, одной строкой"
              onChange={(event) => setBlock(block.key, { note: event.target.value })}
              className={inputClass}
            />
          </fieldset>
        );
      })}
      <div className="grid gap-4">
        <label className={labelClass}>
          Получилось — один освоенный навык
          <textarea rows={2} maxLength={1000} disabled={disabled} value={report.lessonFacts.achieved ?? ""} onChange={(event) => setFact("achieved", event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Поработаем — одна трудность
          <textarea rows={2} maxLength={1000} disabled={disabled} value={report.lessonFacts.difficulty ?? ""} onChange={(event) => setFact("difficulty", event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Дома — одно конкретное действие
          <textarea rows={2} maxLength={1000} disabled={disabled} value={report.lessonFacts.homeAction ?? ""} onChange={(event) => setFact("homeAction", event.target.value)} className={inputClass} />
        </label>
      </div>
    </div>
  );
}

type StepOption = { template: SectorTemplate; directionTitle: string };

const normalizeDirection = (value?: string | null) => (value ?? "").trim().toLocaleLowerCase("ru");

/**
 * Published steps of the lead's own direction (exact title match: «Гитара» is not «Электрогитара»).
 * A start step is required only when its direction has steps; otherwise the report goes without a
 * plan (document 23 §8: «ступени направления ещё не заведены»).
 */
export function trialStepsForDirection(templates: SectorTemplate[] | null, direction?: string | null) {
  const wanted = normalizeDirection(direction);
  if (!templates || !wanted) return [];
  return templates.filter((template) => normalizeDirection(template.direction?.title) === wanted);
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

/** Step 3: the start step and the next two as the plan for three months, format and frequency. */
export function TrialRecommendation({ report, disabled, update, templates, templatesError, direction }: {
  report: TrialLessonReport;
  disabled: boolean;
  update: Update;
  templates: SectorTemplate[] | null;
  templatesError: string | null;
  direction?: string | null;
}) {
  const options = useMemo<StepOption[]>(() => (templates ?? [])
    .map((template) => ({ template, directionTitle: template.direction?.title ?? "Все направления" }))
    .sort((a, b) => a.directionTitle.localeCompare(b.directionTitle, "ru") || a.template.number - b.template.number), [templates]);
  const own = options.filter((option) => normalizeDirection(option.directionTitle) === normalizeDirection(direction));
  // Only the lead's own direction is offered; with no steps there, the report goes without a plan.
  const inDirection = own;

  function chooseStart(option: StepOption) {
    const index = inDirection.findIndex((item) => item.template.id === option.template.id);
    const plan = inDirection.slice(index, index + 3).map((item) => snapshot(item.template));
    update((current) => ({
      ...current,
      recommendation: { ...current.recommendation, startStep: { ...snapshot(option.template), topics: undefined }, plan },
    }));
  }

  return (
    <div className="space-y-5" data-testid="trial-recommendation">
      <div>
        <p className={labelClass}>С какой ступени начнём</p>
        {templates === null ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-stone-500"><LoaderCircle size={15} className="animate-spin" /> Загружаем ступени программы…</p>
        ) : !inDirection.length ? (
          <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950" data-testid="trial-no-steps">
            {templatesError ?? `Для направления «${direction || "не указано"}» ступени программы ещё не заведены. План на три месяца не сформируется; отправить отчёт можно.`}
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-2">
              {inDirection.map((option) => {
                const selected = report.recommendation.startStep?.templateId === option.template.id;
                return (
                  <button
                    key={option.template.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() => chooseStart(option)}
                    className={`${choiceClass(selected)} text-left`}
                  >
                    Ступень {option.template.number} · {option.template.title}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {report.recommendation.plan.length ? (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm" data-testid="trial-plan">
            <p className="font-bold text-emerald-950">План на три месяца</p>
            <ol className="mt-2 space-y-2">
              {report.recommendation.plan.map((step) => (
                <li key={`${step.templateId}-${step.number}`}>
                  <span className="font-semibold text-ink">Ступень {step.number} · {step.title}</span>
                  {step.topics?.length ? <span className="text-stone-600">: {step.topics.join(", ")}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Формат
          <select
            value={report.recommendation.recommendedFormat}
            disabled={disabled}
            onChange={(event) => update((current) => ({
              ...current,
              recommendation: { ...current.recommendation, recommendedFormat: event.target.value as TrialLessonReport["recommendation"]["recommendedFormat"] },
            }))}
            className={inputClass}
          >
            {Object.entries(formatLabels).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Частота
          <select
            value={report.recommendation.recommendedFrequency}
            disabled={disabled}
            onChange={(event) => update((current) => ({
              ...current,
              recommendation: { ...current.recommendation, recommendedFrequency: event.target.value as TrialLessonReport["recommendation"]["recommendedFrequency"] },
            }))}
            className={inputClass}
          >
            {Object.entries(frequencyLabels).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </label>
      </div>
      <label className={labelClass}>
        Заметка для школы
        <textarea
          rows={2}
          maxLength={2000}
          disabled={disabled}
          value={report.raw.teacherNote ?? ""}
          placeholder="Для администратора, семья её не увидит"
          onChange={(event) => update((current) => ({ ...current, raw: { teacherNote: event.target.value } }))}
          className={inputClass}
        />
      </label>
    </div>
  );
}

/** The report as the admin and the preview see it. */
export function TrialReportSummary({ report }: { report: TrialLessonReport }) {
  const levelTitle = (level: TrialDiagnosticLevel | null) => TRIAL_LEVELS.find((item) => item.key === level)?.title ?? "—";
  const rows: Array<[string, string | undefined]> = [
    ["С кем пришёл", { adult: "Со взрослым", alone: "Сам", unknown: undefined }[report.attendance.arrivedWith]],
    ["Опыт до пробного", report.studentProfile.priorExperience !== "unknown" ? experienceLabels[report.studentProfile.priorExperience] : undefined],
    ["Цель и любимая песня", report.studentProfile.goalAndSong],
    ["Получилось", report.lessonFacts.achieved],
    ["Поработаем", report.lessonFacts.difficulty],
    ["Дома", report.lessonFacts.homeAction],
    ["Начинаем", report.recommendation.startStep ? `Ступень ${report.recommendation.startStep.number} · ${report.recommendation.startStep.title}` : undefined],
    ["Формат", report.recommendation.recommendedFormat !== "undecided" ? formatLabels[report.recommendation.recommendedFormat] : undefined],
    ["Частота", report.recommendation.recommendedFrequency !== "undecided" ? frequencyLabels[report.recommendation.recommendedFrequency] : undefined],
    ["План на три месяца", report.recommendation.plan.map((step) => `Ступень ${step.number} · ${step.title}${step.topics?.length ? `: ${step.topics.join(", ")}` : ""}`).join("\n") || undefined],
    ["Заметка для школы", report.raw.teacherNote],
  ];
  return (
    <div className="space-y-4" data-testid="trial-summary">
      <dl className="grid gap-2 sm:grid-cols-2">
        {TRIAL_BLOCKS.map((block) => (
          <div key={block.key} className="rounded-2xl border border-stone-200 bg-white p-3">
            <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">{block.title}</dt>
            <dd className="mt-1 text-sm font-bold text-ink">{levelTitle(report.diagnostics[block.key]?.level ?? null)}</dd>
            {report.diagnostics[block.key]?.note ? <dd className="mt-1 text-sm text-stone-600">{report.diagnostics[block.key].note}</dd> : null}
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
