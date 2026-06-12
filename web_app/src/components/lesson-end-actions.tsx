"use client";

import { CalendarPlus, LoaderCircle, MessageCircleQuestion, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import type { ApiLessonEndActions } from "@/types/api";
import { ApiError, api } from "@/lib/api-client";

interface LessonEndActionsProps {
  lessonId: string;
  lessonTitle: string;
  endActions: ApiLessonEndActions;
  onQuestionSent?: () => void;
  onSignupComplete?: (message: string) => void;
  onError?: (message: string) => void;
}

export function LessonEndActions({
  lessonId,
  lessonTitle,
  endActions,
  onQuestionSent,
  onSignupComplete,
  onError,
}: LessonEndActionsProps) {
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionSent, setQuestionSent] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [submittingSignup, setSubmittingSignup] = useState(false);

  if (!endActions.hasActions) return null;

  async function handleQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    setSubmittingQuestion(true);
    try {
      await api.askLessonQuestion(lessonId, question.trim());
      setQuestion("");
      setQuestionOpen(false);
      setQuestionSent(true);
      onQuestionSent?.();
    } catch (reason) {
      onError?.(reason instanceof ApiError ? reason.message : "Не удалось отправить вопрос");
    } finally {
      setSubmittingQuestion(false);
    }
  }

  async function handleSignup() {
    if (!endActions.signup) return;
    if (endActions.signup.mode === "external" && endActions.signup.externalUrl) {
      window.open(endActions.signup.externalUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setSubmittingSignup(true);
    try {
      const result = await api.signupFromLesson(lessonId);
      if (result.mode === "course") {
        onSignupComplete?.(
          result.alreadyEnrolled
            ? `Вы уже записаны на курс «${result.courseTitle}».`
            : `Вы записаны на курс «${result.courseTitle}».`,
        );
      }
    } catch (reason) {
      onError?.(reason instanceof ApiError ? reason.message : "Не удалось выполнить запись");
    } finally {
      setSubmittingSignup(false);
    }
  }

  return (
    <section className="mt-9 rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">После урока</p>
      <h2 className="font-display mt-3 text-3xl">Нужна помощь или следующий шаг?</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
        Задайте вопрос по уроку «{lessonTitle}» или запишитесь на следующий этап обучения.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {endActions.askTeacher && (
          <button
            type="button"
            onClick={() => setQuestionOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-bold text-ink transition hover:border-ink"
          >
            <MessageCircleQuestion size={16} />
            Задать вопрос преподавателю
          </button>
        )}

        {endActions.signup && (
          endActions.signup.mode === "course" && endActions.signup.alreadyEnrolled ? (
            <Link
              href={`/courses/${endActions.signup.courseId}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white"
            >
              <CalendarPlus size={16} />
              Открыть курс «{endActions.signup.courseTitle}»
            </Link>
          ) : (
            <button
              type="button"
              disabled={submittingSignup}
              onClick={() => void handleSignup()}
              className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submittingSignup ? <LoaderCircle size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
              {endActions.signup.label}
            </button>
          )
        )}
      </div>

      {questionSent && (
        <p className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Вопрос отправлен. Преподаватель увидит его в админке.
        </p>
      )}

      {questionOpen && (
        <form onSubmit={handleQuestionSubmit} className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Ваш вопрос
            <textarea
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-2 min-h-32 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
              placeholder="Напишите, что осталось непонятным по уроку"
            />
          </label>
          <button
            type="submit"
            disabled={submittingQuestion || !question.trim()}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {submittingQuestion ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            Отправить вопрос
          </button>
        </form>
      )}
    </section>
  );
}
