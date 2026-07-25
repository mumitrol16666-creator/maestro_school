"use client";

import {
  BarChart3,
  ChevronRight,
  CircleGauge,
  Eye,
  GraduationCap,
  Target,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

export default function AdminTestsPage() {
  const resource = useApiResource(() => api.preparedTestsAnalytics(), []);

  if (resource.loading) return <LoadingState label="Собираем статистику тестов" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const { summary, tests } = resource.data;
  const hardest = tests
    .flatMap((test) => test.questionStats.map((question) => ({ ...question, testTitle: test.title })))
    .filter((question) => question.answeredCount > 0)
    .sort((left, right) => right.incorrectRate - left.incorrectRate)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="Контроль знаний"
        title="Тесты и результаты"
        description="Здесь видно, кто начал тесты, сколько попыток делают ученики и какие вопросы вызывают больше всего ошибок."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Учеников начали", value: summary.uniqueStudents, icon: UsersRound },
          { label: "Тестов завершено", value: summary.completedStudentTests, icon: GraduationCap },
          { label: "Всего попыток", value: summary.attemptCount, icon: Target },
          { label: "Средний результат", value: summary.averageScore == null ? "—" : `${summary.averageScore}%`, icon: CircleGauge },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-[26px] border border-stone-200 bg-paper p-5 shadow-soft">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-50 text-gold">
              <Icon size={19} />
            </span>
            <p className="mt-4 font-display text-3xl">{value}</p>
            <p className="mt-1 text-sm text-stone-500">{label}</p>
          </div>
        ))}
      </div>

      {hardest.length ? (
        <section className="mt-8 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-red-50 text-red-600">
              <BarChart3 size={19} />
            </span>
            <div>
              <h2 className="font-display text-2xl">Где ученики ошибаются чаще</h2>
              <p className="text-sm text-stone-500">Можно использовать для повторения на уроке</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {hardest.map((question) => (
              <div key={question.questionId} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gold">{question.testTitle}</p>
                    <p className="mt-1 text-sm font-semibold">{question.prompt}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-black text-red-700">
                    {question.incorrectRate}% ошибок
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">Библиотека</p>
            <h2 className="mt-1 font-display text-3xl">{summary.totalTests} тестов</h2>
          </div>
          <p className="text-sm text-stone-500">{summary.startedStudentTests} запусков учениками</p>
        </div>
        <div className="space-y-3">
          {tests.map((test) => (
            <div key={test.id} className="rounded-[26px] border border-stone-200 bg-paper p-4 shadow-soft sm:p-5">
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink font-display text-lg text-gold">
                  {test.order}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-xl sm:text-2xl">{test.title}</h3>
                  <p className="mt-1 text-sm text-stone-500">{test.description}</p>
                </div>
                <Link
                  href={`/admin/tests/${test.id}/preview`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-stone-200 px-4 py-2.5 text-sm font-bold transition hover:border-gold hover:bg-amber-50"
                >
                  <Eye size={16} />
                  <span className="hidden sm:inline">Как ученик</span>
                  <ChevronRight size={14} />
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Начали", test.startedStudents],
                  ["Прошли", test.passedStudents],
                  ["Попыток", test.attemptCount],
                  ["Средний балл", test.averageScore == null ? "—" : `${test.averageScore}%`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl bg-stone-50 px-3 py-2.5">
                    <p className="text-xs text-stone-500">{label}</p>
                    <p className="mt-0.5 font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
