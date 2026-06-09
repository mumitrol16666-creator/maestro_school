import { ArrowUpRight, LockKeyhole, Play } from "lucide-react";
import Link from "next/link";
import { Course } from "@/types";
import { ProgressBar } from "./progress-bar";

export function CourseCard({ course }: { course: Course }) {
  const locked = course.access === "locked";
  return (
    <Link
      href={locked ? "/courses" : `/courses/${course.id}`}
      className="card-hover group overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft"
    >
      <div className="relative h-40 overflow-hidden p-6 text-white" style={{ backgroundColor: course.accent }}>
        <div className="noise absolute inset-0 opacity-25" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/70">
            <span>{course.level}</span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
              {locked ? <LockKeyhole size={16} /> : <ArrowUpRight size={16} />}
            </span>
          </div>
          <span className="font-display max-w-[250px] text-3xl leading-none">{course.title}</span>
        </div>
      </div>
      <div className="p-6">
        <p className="min-h-12 text-sm leading-6 text-stone-500">{course.description}</p>
        <div className="mt-5 flex items-center justify-between text-xs font-semibold text-stone-500">
          <span>{course.lessonsCount} уроков</span>
          <span>{locked ? "Откроется позже" : `${course.progress}% пройдено`}</span>
        </div>
        <div className="mt-3">{locked ? <div className="h-1.5 rounded-full bg-stone-100" /> : <ProgressBar value={course.progress} />}</div>
        {!locked && (
          <div className="mt-5 flex items-center gap-2 text-sm font-bold text-ink">
            <Play size={15} fill="currentColor" /> Продолжить обучение
          </div>
        )}
      </div>
    </Link>
  );
}
