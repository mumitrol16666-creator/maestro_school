"use client";

import { BookOpen, ChevronDown, ChevronRight, FolderOpen, Plus, Search } from "lucide-react";
import { inputClass, secondaryButton } from "./admin-ui";
import type { CmsCourseTree } from "@/types/cms";

interface CourseStructureTreeProps {
  modules: CmsCourseTree["modules"];
  query: string;
  expanded: Set<string>;
  selectedModuleId: string | null;
  selectedLessonId: string | null;
  onQueryChange: (value: string) => void;
  onToggleModule: (moduleId: string) => void;
  onSelectModule: (moduleId: string) => void;
  onSelectLesson: (moduleId: string, lessonId: string) => void;
  onAddModule: () => void;
  onAddLesson: (moduleId: string) => void;
}

export function CourseStructureTree(props: CourseStructureTreeProps) {
  const normalizedQuery = props.query.trim().toLocaleLowerCase("ru");
  const visibleModules = props.modules
    .map((module) => ({
      ...module,
      lessons: normalizedQuery
        ? module.lessons.filter((lesson) => lesson.title.toLocaleLowerCase("ru").includes(normalizedQuery))
        : module.lessons,
    }))
    .filter((module) => !normalizedQuery || module.lessons.length > 0);

  return <aside className="rounded-[28px] border border-stone-200 bg-paper p-4 shadow-soft xl:sticky xl:top-28 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto">
    <div className="flex items-center justify-between gap-3 px-1">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Структура курса</p><p className="mt-1 text-xs text-stone-400">{props.modules.length} модулей · {props.modules.reduce((sum, item) => sum + item.lessons.length, 0)} уроков</p></div>
      <button onClick={props.onAddModule} className={secondaryButton} aria-label="Добавить модуль"><Plus size={15} /></button>
    </div>
    <label className="relative mt-4 block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} /><input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} className={`${inputClass} pl-9`} placeholder="Поиск по урокам" /></label>
    <div className="mt-4 space-y-2">
      {visibleModules.map((module) => {
        const isExpanded = normalizedQuery ? true : props.expanded.has(module.id);
        const selectedModule = props.selectedModuleId === module.id && !props.selectedLessonId;
        return <div key={module.id} className="rounded-2xl border border-stone-100 bg-white">
          <div className={`flex items-center gap-1 rounded-2xl p-1 ${selectedModule ? "bg-amber-50" : ""}`}>
            <button onClick={() => props.onToggleModule(module.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-stone-400 hover:bg-stone-50" aria-label={isExpanded ? "Свернуть модуль" : "Развернуть модуль"}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
            <button onClick={() => props.onSelectModule(module.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left">
              <FolderOpen size={16} className="shrink-0 text-gold" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{module.title}</span><span className="block text-[11px] text-stone-400">{module.lessons.length} уроков</span></span>
            </button>
            <button onClick={() => props.onAddLesson(module.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-stone-400 hover:bg-stone-50" aria-label="Добавить урок"><Plus size={14} /></button>
          </div>
          {isExpanded && <div className="space-y-1 border-t border-stone-100 p-2">
            {module.lessons.length ? module.lessons.map((lesson) => <button key={lesson.id} onClick={() => props.onSelectLesson(module.id, lesson.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${props.selectedLessonId === lesson.id ? "bg-ink text-white" : "hover:bg-stone-50"}`}>
              <BookOpen size={14} className={props.selectedLessonId === lesson.id ? "text-gold" : "text-stone-300"} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{lesson.title}</span><span className={`h-2 w-2 shrink-0 rounded-full ${lesson.isPublished ? "bg-emerald-500" : "bg-amber-400"}`} />
            </button>) : <p className="px-3 py-3 text-xs text-stone-400">{normalizedQuery ? "Совпадений нет" : "Уроков пока нет"}</p>}
          </div>}
        </div>;
      })}
      {!visibleModules.length && <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">Уроки не найдены</p>}
    </div>
  </aside>;
}
