"use client";

import { CheckCircle2, ChevronRight, CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { ProgressBar } from "@/components/progress-bar";
import type { CmsCourseTree, CmsLessonSummary } from "@/types/cms";

type ReadinessIssue = "drafts" | "noVideo" | "noMaterials" | "noHomework";

interface IssueLesson extends CmsLessonSummary {
  moduleTitle: string;
}

interface CourseReadinessProps {
  modules: CmsCourseTree["modules"];
  onSelectLesson: (moduleId: string, lessonId: string) => void;
}

const issueLabels: Record<ReadinessIssue, string> = {
  drafts: "Черновики",
  noVideo: "Без видео",
  noMaterials: "Без материалов",
  noHomework: "Без домашнего задания",
};

export function CourseReadiness({ modules, onSelectLesson }: CourseReadinessProps) {
  const [activeIssue, setActiveIssue] = useState<ReadinessIssue | null>(null);
  const lessons = useMemo(() => modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))), [modules]);
  const issues = useMemo<Record<ReadinessIssue, IssueLesson[]>>(() => ({
    drafts: lessons.filter((lesson) => !lesson.isPublished),
    noVideo: lessons.filter((lesson) => !lesson.hasVideo),
    noMaterials: lessons.filter((lesson) => lesson._count.materials === 0),
    noHomework: lessons.filter((lesson) => lesson._count.homeworks === 0),
  }), [lessons]);
  const ready = lessons.filter((lesson) => lesson.isPublished && lesson.hasVideo && lesson._count.materials > 0 && lesson._count.homeworks > 0).length;
  const published = lessons.filter((lesson) => lesson.isPublished).length;
  const percentage = lessons.length ? Math.round((ready / lessons.length) * 100) : 0;
  const activeLessons = activeIssue ? issues[activeIssue] : [];

  return <section className="mb-6 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Готовность курса</p>
        <div className="mt-2 flex items-baseline gap-3"><span className="font-display text-4xl">{percentage}%</span><span className="text-sm text-stone-500">{ready} из {lessons.length} уроков готовы</span></div>
      </div>
      <div className="w-full max-w-sm"><ProgressBar value={percentage} /><p className="mt-2 text-right text-xs text-stone-400">{published} опубликовано</p></div>
    </div>
    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(issueLabels) as ReadinessIssue[]).map((issue) => {
        const count = issues[issue].length;
        const active = issue === activeIssue;
        return <button key={issue} type="button" onClick={() => setActiveIssue(active ? null : issue)} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${active ? "border-gold bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300"}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${count ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{count ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{issueLabels[issue]}</span><span className="mt-0.5 block text-xs text-stone-400">{count} уроков</span></span>
          <ChevronRight size={15} className={active ? "rotate-90 text-gold" : "text-stone-300"} />
        </button>;
      })}
    </div>
    {activeIssue && <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
      <p className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{issueLabels[activeIssue]}</p>
      {activeLessons.length ? <div className="grid gap-1 md:grid-cols-2">{activeLessons.map((lesson) => <button key={lesson.id} type="button" onClick={() => onSelectLesson(lesson.moduleId, lesson.id)} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-left hover:bg-amber-50"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{lesson.title}</span><span className="block truncate text-xs text-stone-400">{lesson.moduleTitle}</span></span><ChevronRight size={14} className="text-stone-300" /></button>)}</div> : <p className="px-2 py-3 text-sm text-emerald-700">Все уроки соответствуют этому условию.</p>}
    </div>}
  </section>;
}
