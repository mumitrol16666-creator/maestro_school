"use client";

import { ExternalLink } from "lucide-react";
import { attachmentTypeLabels, submissionStatusClass, submissionStatusLabels } from "@/lib/homework-ui";
import type { HomeworkAttempt } from "@/types/homework";

interface HomeworkAttemptTimelineProps {
  attempts: HomeworkAttempt[];
  currentSubmissionId: string;
}

export function HomeworkAttemptTimeline({ attempts, currentSubmissionId }: HomeworkAttemptTimelineProps) {
  if (!attempts.length) return null;

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">История попыток</h2>
      <div className="mt-4 space-y-3">
        {attempts.map((attempt) => {
          const isCurrent = attempt.id === currentSubmissionId;
          return (
            <article
              key={attempt.id}
              className={`rounded-2xl border p-5 ${
                isCurrent ? "border-gold bg-amber-50/40" : "border-stone-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-ink">
                  Попытка {attempt.attemptNumber}
                  {isCurrent ? " · текущая" : ""}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${submissionStatusClass(attempt.status)}`}>
                  {submissionStatusLabels[attempt.status] ?? attempt.status}
                </span>
                {attempt.attachmentType && (
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
                    {attachmentTypeLabels[attempt.attachmentType]}
                  </span>
                )}
              </div>

              <p className="mt-2 text-xs text-stone-400">{formatDate(attempt.createdAt)}</p>

              {attempt.comment && <p className="mt-3 text-sm text-stone-600">{attempt.comment}</p>}

              {attempt.attachmentUrl && (
                <a
                  href={attempt.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-gold"
                >
                  <ExternalLink size={14} /> Открыть материал
                </a>
              )}

              {attempt.reviewComment && (
                <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  <span className="font-bold">Преподаватель: </span>
                  {attempt.reviewComment}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
