"use client";

import { ArrowRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { usePendingHomeworkCount } from "@/hooks/use-pending-homework-count";
import { AdminPendingHomeworkBadge } from "./admin-pending-homework-badge";

export function AdminPendingHomeworkBanner() {
  const { count } = usePendingHomeworkCount();

  if (!count) return null;

  return (
    <Link
      href="/admin/homework-review?status=submitted"
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 shadow-soft transition hover:bg-amber-100/80"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-ink">
          <ClipboardCheck size={20} />
        </span>
        <div>
          <p className="text-sm font-bold text-amber-950">
            {count === 1 ? "1 работа ждёт проверки" : `${count} работ ждут проверки`}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">Ученики отправили домашние задания на проверку</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
        Открыть очередь
        <AdminPendingHomeworkBadge count={count} />
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}
