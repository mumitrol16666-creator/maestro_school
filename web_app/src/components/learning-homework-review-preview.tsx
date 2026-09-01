"use client";

import { ArrowRight, ClipboardCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { homeworkReviewApi } from "@/lib/homework-review-api";
import type { HomeworkSubmissionItem } from "@/types/homework-review";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(value));
}

export function LearningHomeworkReviewPreview() {
  const [items, setItems] = useState<HomeworkSubmissionItem[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    void homeworkReviewApi.list({ status: "submitted", source: "learning", limit: 3 })
      .then((result) => {
        if (!active) return;
        setItems(result.data);
        setTotal(result.meta?.total ?? result.data.length);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!items?.length) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-gold">
            <ClipboardCheck size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase text-amber-800">На проверке</p>
            <h2 className="truncate font-display text-xl text-ink">
              {total === 1 ? "1 работа ученика" : `${total} работ учеников`}
            </h2>
          </div>
        </div>
        <Link href="/admin/homework-review?status=submitted" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-xs font-black text-amber-950">
          Вся очередь <ArrowRight size={14} />
        </Link>
      </header>
      <div className="divide-y divide-stone-100">
        {items.map((item) => (
          <Link
            key={item.submissionId}
            href={`/admin/homework-review/${item.submissionId}`}
            className="flex min-w-0 items-center gap-3 px-5 py-4 transition hover:bg-stone-50 sm:px-6"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-ink">{item.studentName}</p>
              <p className="mt-1 truncate text-xs font-semibold text-stone-500">
                {item.courseTitle} · {item.moduleTitle}
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 text-xs font-semibold text-stone-400 sm:inline-flex">
              <Clock3 size={13} /> {formatDate(item.submittedAt)}
            </span>
            <ArrowRight size={16} className="shrink-0 text-gold" />
          </Link>
        ))}
      </div>
    </section>
  );
}
