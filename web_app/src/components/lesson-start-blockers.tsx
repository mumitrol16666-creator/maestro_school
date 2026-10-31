"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { OfflineLessonStartBlocker } from "@/types/teacher-offline";

const VISIBLE = 3;
const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

function lessonDay(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? dayFormat.format(new Date(`${date}T12:00:00+05:00`)) : date;
}

/**
 * 31.10 (Vladislav): a new lesson does not start while an earlier one of the teacher ended
 * without a sent report — otherwise the topics start from old percents and the reports collide.
 */
export function LessonStartBlockers({ blockers }: { blockers: OfflineLessonStartBlocker[] }) {
  if (!blockers.length) return null;
  const many = blockers.length > 1;
  return (
    <div
      className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-950"
      data-testid="lesson-start-blockers"
      role="alert"
    >
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle size={16} className="shrink-0 text-amber-700" />
        {many ? "Сначала сдайте прошлые уроки" : "Сначала сдайте прошлый урок"}
      </p>
      <p className="mt-2 text-xs leading-5 text-amber-900">
        Пока отчёт не отправлен, новый урок не начать: проценты тем возьмутся старые и отчёты
        перепутаются. Если урок не состоялся, откройте его и отмените.
      </p>
      <ul className="mt-3 space-y-2">
        {blockers.slice(0, VISIBLE).map((blocker) => (
          <li key={blocker.crmClassId}>
            <Link
              href={`/admin/offline-lessons/${encodeURIComponent(blocker.crmClassId)}`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2 transition hover:border-amber-400"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">{blocker.title}</span>
                <span className="block text-xs text-stone-500">
                  {[lessonDay(blocker.date), blocker.startTime, blocker.groupName].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-amber-800">Открыть урок</span>
            </Link>
          </li>
        ))}
      </ul>
      {blockers.length > VISIBLE ? (
        <Link href="/admin#today-reports" className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-amber-800 underline">
          Ещё {blockers.length - VISIBLE} — все отчёты к отправке на «Сегодня»
        </Link>
      ) : null}
    </div>
  );
}
