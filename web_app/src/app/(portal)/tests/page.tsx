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
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

export default function TestsPage() {
  const resource = useApiResource(() => api.preparedTests(), []);

  if (resource.loading) return <LoadingState label="Загружаем тесты" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
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
        title="Курс теории гитары"
        description="Сначала прочитайте короткий урок, затем закрепите его тестом. В день доступен один тест и до двух попыток на него."
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
              <span className="block text-xs font-bold uppercase tracking-[0.16em] text-gold">
                Продолжить
              </span>
              <span className="mt-1 block font-display text-2xl leading-tight">{next.title}</span>
              <span className="mt-1 block text-sm text-white/60">
                {next.questionCount} вопросов · проходной результат {next.passingScore}%
              </span>
            </span>
            <ChevronRight className="shrink-0 text-gold transition group-hover:translate-x-1" />
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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
            <Flame size={22} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Правила прохождения</p>
            <p className="mt-1 font-display text-2xl">{dailyRules.testLimit} тест · {dailyRules.attemptLimit} попытки в день</p>
            <p className="mt-1 text-sm text-stone-600">
              За успешную сдачу: +{xpRules.firstAttempt} XP с первой попытки или +{xpRules.retry} XP со второй. До {xpRules.weeklyLimit} тестов в неделю.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section}>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink font-display text-lg text-gold">
                {section}
              </span>
              <div>
                <h2 className="font-display text-2xl">Раздел {section}</h2>
                <p className="text-xs text-stone-500">Тесты открываются по порядку</p>
              </div>
            </div>
            <div className="space-y-3">
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
                        ? "bg-amber-50 text-gold"
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
                    <span className="mt-2 block text-xs font-bold uppercase tracking-[0.1em] text-stone-400">
                      {test.questionCount} вопросов
                      {test.attemptsUsedToday ? ` · сегодня: ${test.attemptsUsedToday} из ${dailyRules.attemptLimit}` : ""}
                      {test.bestScore != null ? ` · лучший результат ${test.bestScore}%` : ""}
                    </span>
                  </span>
                  {test.available && !test.passed ? (
                    <Link
                      href={`/tests/${test.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gold hover:text-ink"
                    >
                      <span className="hidden sm:inline">{test.attemptsUsed ? "Продолжить" : "Начать"}</span>
                      <ChevronRight size={16} />
                    </Link>
                  ) : test.passed ? (
                    <Link
                      href={`/tests/${test.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 transition hover:border-emerald-500"
                    >
                      <BookOpen size={15} />
                      <span className="hidden sm:inline">Материал и разбор</span>
                    </Link>
                  ) : (test.dailyLocked || test.exhausted) && !test.locked ? (
                    <Link href={`/tests/${test.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-900">
                      <BookOpen size={15} /><span className="hidden sm:inline">Читать</span>
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
