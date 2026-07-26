"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Medal,
  RotateCcw,
  Save,
  Send,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { PreparedTestAttemptResponse, PreparedTestReviewItem } from "@/types/prepared-tests";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function PreparedTestPage() {
  const params = useParams<{ testId: string }>();
  const testId = params.testId;
  const { refreshUser } = useAuth();
  const resource = useApiResource(() => api.preparedTest(testId), [testId]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [result, setResult] = useState<PreparedTestAttemptResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [hydratedTestId, setHydratedTestId] = useState<string | null>(null);
  const [retakeMode, setRetakeMode] = useState(false);

  useEffect(() => {
    const test = resource.data;
    if (!test || hydratedTestId === test.id) return;
    setAnswers(test.draft?.answers ?? {});
    setCurrentQuestion(Math.min(test.draft?.currentQuestion ?? 0, test.questions.length - 1));
    setHydratedTestId(test.id);
    setRetakeMode(Boolean(test.draft));
    setSaveState(test.draft ? "saved" : "idle");
  }, [hydratedTestId, resource.data]);

  useEffect(() => {
    const test = resource.data;
    if (!test || hydratedTestId !== test.id || result || (test.passed && !retakeMode)) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void api.savePreparedTestDraft(test.id, answers, currentQuestion)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [answers, currentQuestion, hydratedTestId, resource.data, result, retakeMode]);

  const answeredCount = Object.keys(answers).length;
  const test = resource.data;
  const question = test?.questions[currentQuestion];
  const selectedOptionId = question ? answers[question.id] : undefined;
  const progress = test ? Math.round(((currentQuestion + 1) / test.questions.length) * 100) : 0;
  const review = useMemo<PreparedTestReviewItem[]>(
    () => result?.review ?? test?.latestAttempt?.review ?? [],
    [result, test?.latestAttempt?.review],
  );

  if (resource.loading) return <LoadingState label="Открываем тест" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!test || !question) return null;

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const submittedResult = await api.submitPreparedTest(testId, answers);
      setResult(submittedResult);
      setRetakeMode(false);
      if (submittedResult.rewardPointsAwarded > 0) {
        void refreshUser();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось отправить ответы");
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    setResult(null);
    setRetakeMode(true);
    setAnswers({});
    setCurrentQuestion(0);
    setSubmitError(null);
    setSaveState("idle");
  }

  const completed = result ?? (!retakeMode && (test.passed || test.exhausted) ? {
    id: "latest",
    testId: test.id,
    attemptNumber: test.latestAttempt?.attemptNumber ?? test.attemptsUsed,
    score: test.latestAttempt?.score ?? test.bestScore ?? 0,
    correctAnswers: test.latestAttempt?.correctAnswers ?? 0,
    totalQuestions: test.latestAttempt?.totalQuestions ?? test.questionCount,
    passed: test.latestAttempt?.passed ?? test.passed,
    passingScore: test.passingScore,
    attemptsRemaining: test.attemptsRemaining,
    rewardPointsAwarded: 0,
    review,
    topicsToRepeat: (test.latestAttempt?.passed ?? test.passed) ? [] : [test.description],
    nextTest: test.nextTest,
    createdAt: test.latestAttempt?.createdAt ?? "",
  } : null);

  return (
    <>
      <PageHeader
        eyebrow={`Тест ${test.order} из ${test.totalTests}`}
        title={test.title}
        description={test.description}
        action={
          <Link
            href="/tests"
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-paper px-4 py-2.5 text-sm font-bold"
          >
            <ChevronLeft size={16} /> Все тесты
          </Link>
        }
      />

      {completed ? (
        <section className={`rounded-[30px] border p-5 shadow-soft sm:p-8 ${
          completed.passed
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}>
          <div className="flex items-start gap-4">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${
              completed.passed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}>
              {completed.passed ? <CheckCircle2 size={28} /> : <TriangleAlert size={26} />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                Попытка {completed.attemptNumber}
              </p>
              <h2 className="mt-1 font-display text-3xl leading-tight">
                {completed.passed ? "Тест пройден" : "Есть темы, которые стоит повторить"}
              </h2>
              <p className="mt-2 text-sm text-stone-600">
                Правильных ответов: {completed.correctAnswers} из {completed.totalQuestions}.
                Проходной результат — {completed.passingScore}%.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/75 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Результат</p>
              <p className="mt-1 font-display text-3xl">{completed.score}%</p>
            </div>
            <div className="rounded-2xl bg-white/75 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Лучший</p>
              <p className="mt-1 font-display text-3xl">{Math.max(completed.score, test.bestScore ?? 0)}%</p>
            </div>
            <div className="rounded-2xl bg-white/75 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                {completed.passed ? "Награда" : "Повторные попытки"}
              </p>
              <p className="mt-1 flex items-center gap-2 font-display text-3xl">
                {completed.passed ? (
                  completed.rewardPointsAwarded > 0
                    ? <><Medal size={22} className="text-gold" /> +{completed.rewardPointsAwarded}</>
                    : <span className="text-xl">Уже получена</span>
                ) : <span className="text-xl">Без лимита</span>}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-stone-200 bg-white/75 p-5">
            <h3 className="font-display text-2xl">Разбор ответов</h3>
            <p className="mt-2 text-sm text-stone-600">
              Зелёным отмечены правильные ответы. В ошибках показаны ваш и правильный варианты.
            </p>
            <div className="mt-4 space-y-3">
              {review.map((item, index) => (
                <article
                  key={item.questionId}
                  className={`rounded-2xl border p-4 ${
                    item.isCorrect
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-red-200 bg-red-50/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {item.isCorrect ? (
                      <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-700" />
                    ) : (
                      <XCircle size={19} className="mt-0.5 shrink-0 text-red-600" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-wider text-stone-500">
                        Вопрос {index + 1} · {item.isCorrect ? "Верно" : "Ошибка"}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{item.prompt}</p>
                    </div>
                  </div>
                  <p className={`mt-3 text-sm ${item.isCorrect ? "text-emerald-800" : "text-red-800"}`}>
                    <strong>Ваш ответ:</strong> {item.selectedOptionText ?? "Нет ответа"}
                  </p>
                  {!item.isCorrect && item.correctOptionText ? (
                    <p className="mt-2 flex items-start gap-2 text-sm text-emerald-800">
                      <Check size={16} className="mt-0.5 shrink-0" />
                      <span><strong>Правильный ответ:</strong> {item.correctOptionText}</span>
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {completed.nextTest ? (
              <Link
                href={`/tests/${completed.nextTest.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3.5 text-sm font-bold text-white transition hover:bg-gold hover:text-ink"
              >
                Следующий тест
                <ChevronRight size={16} />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-sm font-bold transition hover:border-gold"
            >
              <RotateCcw size={16} /> Пройти ещё раз
            </button>
            <Link
              href="/tests"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-sm font-bold"
            >
              Вернуться к тестам
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="mb-5 rounded-[24px] border border-stone-200 bg-paper p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
              <span>Вопрос {currentQuestion + 1} из {test.questionCount}</span>
              <span className="flex items-center gap-1.5 normal-case tracking-normal">
                {saveState === "saving" ? <><Clock3 size={14} /> Сохраняем…</> : null}
                {saveState === "saved" ? <><Save size={14} className="text-emerald-600" /> Ответы сохранены</> : null}
                {saveState === "error" ? <><TriangleAlert size={14} className="text-amber-600" /> Проверим ещё раз</> : null}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-gold transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <fieldset className="rounded-[30px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-8">
            <legend className="sr-only">Вопрос {currentQuestion + 1}</legend>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">
              Выберите один ответ
            </p>
            <h2 className="mt-3 font-display text-2xl leading-tight sm:text-3xl">{question.prompt}</h2>
            <div className="mt-6 grid gap-3">
              {question.options.map((option, index) => {
                const selected = selectedOptionId === option.id;
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition sm:p-5 ${
                      selected
                        ? "border-gold bg-amber-50 font-semibold shadow-sm"
                        : "border-stone-200 hover:border-gold/50 hover:bg-stone-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.id}
                      checked={selected}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                      className="sr-only"
                    />
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${
                      selected ? "border-gold bg-gold text-ink" : "border-stone-300 text-stone-400"
                    }`}>
                      {selected ? <Check size={15} /> : String.fromCharCode(65 + index)}
                    </span>
                    <span className="pt-1">{option.text}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {submitError ? (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {submitError}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentQuestion((value) => Math.max(0, value - 1))}
              disabled={currentQuestion === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-paper px-4 py-3 text-sm font-bold disabled:opacity-40"
            >
              <ArrowLeft size={17} /> Назад
            </button>
            <span className="hidden text-xs font-semibold text-stone-500 sm:block">
              Отвечено {answeredCount} из {test.questionCount}
            </span>
            {currentQuestion < test.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentQuestion((value) => value + 1)}
                disabled={!selectedOptionId}
                className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Дальше <ArrowRight size={17} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting || answeredCount < test.questionCount}
                className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} /> {submitting ? "Проверяем…" : "Завершить"}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
