"use client";

import {
  CheckCircle2,
  ChevronRight,
  BookOpen,
  Clock3,
  ClipboardCheck,
  Flame,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { ScreenError } from "@/components/app-error-screen";
import { EmptyState } from "@/components/data-states";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { formatCount, formatOutOf } from "@/lib/plural";

const QUESTION_FORMS = ["вопрос", "вопроса", "вопросов"] as const;

export default function TestsPage() {
  const resource = useApiResource(() => api.preparedTests(), []);

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="list" label="Загружаем тесты" />;
  if (resource.error && !resource.data) return <ScreenError message={resource.error} code={resource.errorCode} retry={resource.reload} />;
  if (!resource.data?.tests.length) {
    return (
      <EmptyState
        title="Тестов пока нет"
        description="Когда школа откроет новые тесты, они появятся в этом разделе."
      />
    );
  }

  const { tests, completedCount, total, xpRules, dailyRules } = resource.data;
  const next = tests.find((test) => test.available && !test.passed);
  const sections = [...new Set(tests.map((test) => test.section))];

  return (
    <>
      <PageHeader
        eyebrow="Теория Maestro"
        title="Тесты по теории"
        description="Выбирайте любой тест: прочитайте короткий урок и закрепите его. В день доступен один тест и до двух попыток на него."
        action={
          <div className="rounded-2xl border border-stone-200 bg-paper px-4 py-3 text-sm shadow-soft">
            <span className="font-display text-2xl">{completedCount}</span>
            <span className="ml-2 text-stone-500">из {total}</span>
          </div>
        }
      />

      <div className="mb-7 grid gap-3 sm:grid-cols-2">
        {next ? (
          <Link
            href={`/tests/${next.id}`}
            className="group flex items-center gap-4 rounded-[28px] bg-ink p-5 text-white shadow-soft transition hover:-translate-y-0.5 sm:p-6"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold text-ink">
              <ClipboardCheck size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide text-gold-ink">
                Продолжить
              </span>
              <span className="mt-1 block font-display text-2xl leading-tight">{next.title}</span>
              <span className="mt-1 block text-sm text-white/60">
                {formatCount(next.questionCount, QUESTION_FORMS)} · проходной результат {next.passingScore}%
              </span>
            </span>
            <ChevronRight className="shrink-0 text-gold-ink transition group-hover:translate-x-1" />
          </Link>
        ) : completedCount === total ? (
          <div className="flex items-center gap-4 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 sm:p-6">
            <CheckCircle2 size={25} />
            <div>
              <p className="font-display text-2xl">Все доступные тесты пройдены</p>
              <p className="mt-1 text-sm">Отличный результат. Можно повторить материалы курса.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6">
            <Clock3 size={25} />
            <div>
              <p className="font-display text-2xl">На сегодня тесты завершены</p>
              <p className="mt-1 text-sm">Следующий тест откроется завтра. Материалы можно читать уже сейчас.</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold-ink">
            <Flame size={22} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Правила прохождения</p>
            <p className="mt-1 font-display text-2xl">{formatCount(dailyRules.testLimit, ["тест", "теста", "тестов"])} · {formatCount(dailyRules.attemptLimit, ["попытка", "попытки", "попыток"])} в день</p>
            <p className="mt-1 text-sm text-stone-600">
              За успешную сдачу: +{xpRules.firstAttempt} XP с первой попытки или +{xpRules.retry} XP со второй. До {formatCount(xpRules.weeklyLimit, ["теста", "тестов", "тестов"])} в неделю.
            </p>
          </div>
        </div>
      </div>

      {/* Plan 5.3: sections are folded; the one with the next test is open. */}
      <div className="space-y-4">
        {sections.map((section) => {
          const inSection = tests.filter((test) => test.section === section);
          const passedCount = inSection.filter((test) => test.passed).length;
          return (
          <details key={section} open={next ? next.section === section : section === sections[0]} className="group rounded-[26px] border border-stone-200 bg-white" data-testid={`tests-section-${section}`}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink font-display text-lg text-gold-ink">
                {section}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-2xl">Раздел {section}</span>
                <span className="block text-xs text-stone-500">Пройдено {formatOutOf(passedCount, inSection.length, ["теста", "тестов", "тестов"])}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-stone-400 transition group-open:rotate-90" />
            </summary>
            <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
              {tests.filter((test) => test.section === section).map((test) => (
                <div
                  key={test.id}
                  className={`flex items-center gap-4 rounded-[26px] border p-4 sm:p-5 ${
                    test.passed
                      ? "border-emerald-200 bg-emerald-50/60"
                      : test.available
                        ? "border-gold/40 bg-paper shadow-soft"
                        : test.exhausted || test.dailyLocked
                          ? "border-amber-200 bg-amber-50/60"
                          : "border-stone-200 bg-stone-50/70"
                  }`}
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black ${
                    test.passed
                      ? "bg-emerald-100 text-emerald-700"
                      : test.available
                        ? "bg-amber-50 text-gold-ink"
                        : test.exhausted || test.dailyLocked
                          ? "bg-amber-100 text-amber-700"
                          : "bg-stone-200 text-stone-400"
                  }`}>
                    {test.passed
                      ? <CheckCircle2 size={20} />
                      : test.exhausted || test.dailyLocked
                        ? <Clock3 size={18} />
                        : test.locked
                          ? <LockKeyhole size={18} />
                          : test.order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl sm:text-2xl">{test.title}</span>
                    <span className="mt-1 block text-sm text-stone-500">{test.description}</span>
                    <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-stone-500">
                      {formatCount(test.questionCount, QUESTION_FORMS)}
                      {test.attemptsUsedToday ? ` · использовано сегодня: ${formatOutOf(test.attemptsUsedToday, dailyRules.attemptLimit, ["попытки", "попыток", "попыток"])}` : ""}
                      {test.bestScore != null ? ` · лучший результат ${test.bestScore}%` : ""}
                    </span>
                  </span>
                  {test.available && !test.passed ? (
                    <Link
                      href={`/tests/${test.id}`}
                      aria-label={`${test.attemptsUsed ? "Продолжить" : "Начать"}: ${test.title}`}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full bg-ink px-3 text-sm sm:px-4 font-bold text-white transition hover:bg-gold hover:text-ink"
                    >
                      <span className="hidden sm:inline">{test.attemptsUsed ? "Продолжить" : "Начать"}</span>
                      <ChevronRight size={16} />
                    </Link>
                  ) : test.passed ? (
                    <Link
                      href={`/tests/${test.id}`}
                      aria-label={`Материал и разбор: ${test.title}`}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border border-emerald-300 bg-white px-3 text-sm sm:px-4 font-bold text-emerald-800 transition hover:border-emerald-500"
                    >
                      <BookOpen size={15} />
                      <span className="hidden sm:inline">Материал и разбор</span>
                    </Link>
                  ) : (test.dailyLocked || test.exhausted) && !test.locked ? (
                    <Link href={`/tests/${test.id}`} aria-label={`Читать: ${test.title}`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border border-amber-300 bg-white px-3 text-sm sm:px-4 font-bold text-amber-900">
                      <BookOpen size={15} /><span className="hidden sm:inline">Читать</span>
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
          );
        })}
      </div>
    </>
  );
}
