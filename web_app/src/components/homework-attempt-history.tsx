"use client";

import { ExternalLink } from "lucide-react";
import { attachmentTypeLabels, submissionStatusClass, submissionStatusLabels } from "@/lib/homework-ui";
import type { HomeworkAttempt } from "@/types/homework";

interface HomeworkAttemptHistoryProps {
  attempts: HomeworkAttempt[];
  title?: string;
}

export function HomeworkAttemptHistory({ attempts, title = "История попыток" }: HomeworkAttemptHistoryProps) {
  if (!attempts.length) return null;

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-4 space-y-3">
        {attempts.map((attempt) => (
          <article
            key={attempt.id}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-ink">Попытка {attempt.attemptNumber}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${submissionStatusClass(attempt.status)}`}>
                {submissionStatusLabels[attempt.status] ?? attempt.status}
              </span>
              {attempt.attachmentType && (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
                  {attachmentTypeLabels[attempt.attachmentType]}
                </span>
              )}
            </div>

            <p className="mt-3 text-xs text-stone-400">Отправлено {formatDate(attempt.createdAt)}</p>

            {attempt.comment && (
              <p className="mt-3 text-sm leading-7 text-stone-600">{attempt.comment}</p>
            )}

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
              <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Комментарий преподавателя</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">{attempt.reviewComment}</p>
                {attempt.reviewedAt && (
                  <p className="mt-2 text-xs text-stone-400">
                    Проверено {formatDate(attempt.reviewedAt)}
                    {attempt.reviewedBy ? ` · ${attempt.reviewedBy}` : ""}
                  </p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
