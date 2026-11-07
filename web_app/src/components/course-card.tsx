import { ArrowUpRight, BookOpen, CheckCircle2, Play } from "lucide-react";
import Link from "next/link";
import { courseStateLine, freeLessonsNote, type CourseStateTone, type Voice } from "@/lib/course-access-format";
import { formatCount } from "@/lib/plural";
import { Course } from "@/types";
import { ProgressBar } from "./progress-bar";

const STATE_TONE_STYLES: Record<CourseStateTone, string> = {
  free: "bg-emerald-50 text-emerald-800",
  school: "bg-emerald-50 text-emerald-800",
  active: "bg-emerald-50 text-emerald-800",
  pending: "bg-amber-50 text-amber-900",
  price: "bg-stone-100 text-ink",
};

export function CourseCard({ course, rewardLine = null, voice = "ty" }: { course: Course; rewardLine?: string | null; voice?: Voice }) {
  const state = course.sale ? courseStateLine(course.sale, voice) : null;
  const freeNote = course.sale ? freeLessonsNote(course.sale) : null;
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
        <p className="min-h-12 overflow-hidden break-words text-sm leading-6 text-stone-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
          {course.description}
        </p>
        <div className="mt-5 flex items-center justify-between text-xs font-semibold text-stone-500">
          <span>{formatCount(course.lessonsCount, ["урок", "урока", "уроков"])}</span>
          <span>
            {completed ? "Курс пройден" : enrolled ? `${course.progress}% пройдено` : "Можно начать сейчас"}
          </span>
        </div>
        {state ? (
          <p
            className={`mt-3 rounded-full px-3 py-1.5 text-xs font-bold ${STATE_TONE_STYLES[state.tone]}`}
            data-testid="course-state"
            data-tone={state.tone}
          >
            {state.text}
          </p>
        ) : null}
        {freeNote ? <p className="mt-2 text-xs font-semibold text-stone-500" data-testid="course-free-note">{freeNote}</p> : null}
        {rewardLine ? <p className="mt-2 text-xs font-semibold text-stone-500" data-testid="course-reward">{rewardLine}</p> : null}
        <div className="mt-3">{enrolled ? <ProgressBar value={course.progress} /> : <div className="h-1.5 rounded-full bg-stone-100" />}</div>
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-ink">
          {completed ? <CheckCircle2 size={15} /> : enrolled ? <Play size={15} fill="currentColor" /> : <BookOpen size={15} />}
          {completed ? "Открыть курс" : enrolled ? "Продолжить обучение" : "Посмотреть курс"}
        </div>
      </div>
    </Link>
  );
}
