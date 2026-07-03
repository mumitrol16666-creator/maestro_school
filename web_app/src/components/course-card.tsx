import { ArrowUpRight, BookOpen, CheckCircle2, Play } from "lucide-react";
import Link from "next/link";
import { Course } from "@/types";
import { ProgressBar } from "./progress-bar";

export function CourseCard({ course }: { course: Course }) {
  const enrolled = course.access === "enrolled";
  const completed = enrolled && course.progress >= 100;
  return (
    <Link
      href={`/courses/${course.id}`}
      className="card-hover group overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft"
    >
      <div className="relative h-40 overflow-hidden p-6 text-white" style={{ backgroundColor: course.accent }}>
        <div className="noise absolute inset-0 opacity-25" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/70">
            <span>{course.level}</span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition group-hover:bg-white/20 group-hover:scale-105">
              <ArrowUpRight size={16} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
          <span className="font-display max-w-[250px] text-3xl leading-none">{course.title}</span>
        </div>
      </div>
      <div className="p-6">
        <p className="min-h-12 text-sm leading-6 text-stone-500">{course.description}</p>
        <div className="mt-5 flex items-center justify-between text-xs font-semibold text-stone-500">
          <span>{course.lessonsCount} уроков</span>
          <span>
            {completed ? "Курс пройден" : enrolled ? `${course.progress}% пройдено` : "Можно начать сейчас"}
          </span>
        </div>
        {course.completionCoinsReward > 0 && (
          <p className="mt-3 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
            +{course.completionCoinsReward.toLocaleString("ru-RU")} Maestro Coins за завершение
          </p>
        )}
        <div className="mt-3">{enrolled ? <ProgressBar value={course.progress} /> : <div className="h-1.5 rounded-full bg-stone-100" />}</div>
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-ink">
          {completed ? <CheckCircle2 size={15} /> : enrolled ? <Play size={15} fill="currentColor" /> : <BookOpen size={15} />}
          {completed ? "Открыть курс" : enrolled ? "Продолжить обучение" : "Посмотреть курс"}
        </div>
      </div>
    </Link>
  );
}
