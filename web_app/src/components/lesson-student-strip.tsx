"use client";

import { BarChart3, CalendarCheck2, Flame, GraduationCap, History, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { LevelBadge } from "@/components/level-summary";
import type { ProductLevelEmblem, ProductLevelTone } from "@/types/api";
import type { LessonStudentOverview } from "@/types/teacher-offline";

/**
 * Plan 1.14: above the lesson steps the teacher sees who is in front of them — the sector and its
 * percent, LEVEL, place in this week's league, streak, the school's programme level and attendance —
 * and opens the full statistics with one button.
 */
function SectorRing({ percent }: { percent: number }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="4" />
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#b45309" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, percent)) / 100) * length} ${length}`} />
    </svg>
  );
}

function Stat({ icon, label, value, hint, testId }: { icon: ReactNode; label: string; value: string; hint?: string; testId: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2" data-testid={testId} title={hint}>
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">{label}</p>
        <p className="truncate text-sm font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Aqtobe" });

function AttendanceDots({ recent }: { recent: NonNullable<LessonStudentOverview["attendance"]>["recent"] }) {
  return (
    <span className="mt-1 flex gap-1" aria-hidden="true">
      {recent.slice().reverse().map((item, index) => (
        <span key={`${item.date}-${index}`} className={`h-2 w-2 rounded-full ${
          ["present", "late"].includes(item.attendanceStatus) ? "bg-emerald-500"
            : item.attendanceStatus === "excused_absence" ? "bg-amber-400" : "bg-red-400"
        }`} />
      ))}
    </span>
  );
}

export function LessonStudentStrip({
  students,
  loading,
  compact,
  onOpenStudent,
}: {
  students: LessonStudentOverview[];
  loading: boolean;
  /** Groups: one short line of icons per student. */
  compact: boolean;
  onOpenStudent: (crmStudentId: string) => void;
}) {
  if (loading && !students.length) {
    return <div className="mb-5 h-24 animate-pulse rounded-[24px] border border-stone-200 bg-white" aria-label="Загружаем показатели ученика" />;
  }
  if (!students.length) return null;
  return (
    <section className="mb-5 space-y-3" data-testid="lesson-student-strip" aria-label="Показатели учеников">
      {students.map((student) => {
        const level = student.level;
        const attendance = student.attendance;
        return (
          <article key={student.crmStudentId} className={`rounded-[24px] border border-stone-200 bg-paper ${compact ? "p-3" : "p-4"} shadow-sm`} data-testid="lesson-student-strip-item">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {level ? (
                  <LevelBadge size="small" level={{
                    level: level.level, code: level.code, title: level.title, minPoints: level.minPoints,
                    tone: level.tone as ProductLevelTone, emblem: level.emblem as ProductLevelEmblem,
                  }} />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate font-display text-xl text-ink">{student.name}</p>
                  <p className="text-xs font-semibold text-stone-500">
                    {level ? `${level.title} · ${level.points.toLocaleString("ru-RU")} баллов` : student.appLinked ? "LEVEL пока нет" : "Не вошёл в приложение"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenStudent(student.crmStudentId)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white hover:bg-stone-800"
                aria-label={`Статистика ученика: ${student.name}`}
              >
                <BarChart3 size={16} /> Статистика ученика
              </button>
            </div>
            <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-5"}`}>
              <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2" data-testid="strip-sector">
                {student.sector ? <SectorRing percent={student.sector.percent} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-black text-stone-500">—</span>}
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Сектор</p>
                  <p className="truncate text-sm font-bold text-ink">
                    {student.sector ? `${student.sector.sequence} · ${student.sector.percent} %` : "не открыт"}
                  </p>
                </div>
              </div>
              <Stat testId="strip-league" icon={<Trophy size={20} className="shrink-0 text-amber-600" />} label="Лига недели"
                value={student.league ? `${student.league.position ? `${student.league.position} место` : "без места"} · ${student.league.xp} XP` : "—"}
                hint={student.league ? `Цель недели ${student.league.goalXp} XP, участников ${student.league.participantCount}` : undefined} />
              <Stat testId="strip-streak" icon={<Flame size={20} className="shrink-0 text-orange-600" />} label="Серия"
                value={student.streakWeeks != null ? `${student.streakWeeks} нед.` : "—"} />
              <Stat testId="strip-program" icon={<GraduationCap size={20} className="shrink-0 text-sky-700" />} label="Ступень"
                value={student.programLevel ?? "не указана"} />
              <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2" data-testid="strip-attendance">
                <CalendarCheck2 size={20} className="shrink-0 text-emerald-700" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Посещения</p>
                  <p className="truncate text-sm font-bold text-ink">{attendance && attendance.total ? `${attendance.attended} из ${attendance.total}` : "—"}</p>
                  {attendance?.recent.length ? <AttendanceDots recent={attendance.recent} /> : null}
                </div>
              </div>
            </div>
            {!compact && student.lastLessonDate ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                <History size={13} /> Прошлый урок: {dateFormat.format(new Date(student.lastLessonDate))}
              </p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
