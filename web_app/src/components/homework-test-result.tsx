"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import type { HomeworkAttempt } from "@/types/homework";

interface HomeworkTestResultProps {
  passingScore: number;
  latestAttempt: HomeworkAttempt | null;
  lessonCompleted: boolean;
}

export function HomeworkTestResult({ passingScore, latestAttempt, lessonCompleted }: HomeworkTestResultProps) {
  if (!latestAttempt || latestAttempt.testScore === null) return null;

  const passed = latestAttempt?.testPassed === true || lessonCompleted;
  const failed = latestAttempt?.testPassed === false;

  if (passed) {
    return (
      <div className="mt-9 rounded-[30px] border border-emerald-100 bg-emerald-50 p-6 shadow-soft sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Тест к уроку</p>
        <div className="mt-3 flex items-start gap-3">
          <CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={28} />
          <div>
            <h2 className="font-display text-3xl text-emerald-900">Тест пройден</h2>
            <p className="mt-2 text-sm font-semibold text-emerald-800">
              Результат: {latestAttempt?.testScore ?? "—"}%. Урок завершён, баллы начислены.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mt-6 rounded-[24px] border border-red-100 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 shrink-0 text-red-600" size={20} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-700">Последняя попытка</p>
            <p className="mt-2 text-sm font-bold text-red-900">
              Набрано {latestAttempt.testScore}%. Нужно не менее {passingScore}%.
            </p>
            {latestAttempt.reviewComment && (
              <p className="mt-2 text-sm leading-7 text-red-800">{latestAttempt.reviewComment}</p>
            )}
            <p className="mt-2 text-sm text-red-700">Исправьте ошибки и сдайте тест ещё раз.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
