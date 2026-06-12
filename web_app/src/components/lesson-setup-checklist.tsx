"use client";

import { ArrowRight, CheckCircle2, Circle, ClipboardList, FileStack, FileText, Video } from "lucide-react";
import type { LessonWorkspaceTab } from "./lesson-workspace";

interface LessonSetupChecklistProps {
  hasVideo: boolean;
  hasDescription: boolean;
  materialsCount: number;
  hasHomework: boolean;
  homeworkType?: "assignment" | "test" | null;
  activeTab: LessonWorkspaceTab;
  onGoTo: (tab: LessonWorkspaceTab) => void;
}

const items: Array<{
  id: LessonWorkspaceTab;
  label: string;
  icon: typeof Video;
  done: (props: LessonSetupChecklistProps) => boolean;
  summary: (props: LessonSetupChecklistProps) => string;
}> = [
  {
    id: "content",
    label: "Видео и описание",
    icon: Video,
    done: (p) => p.hasVideo && p.hasDescription,
    summary: (p) => {
      if (p.hasVideo && p.hasDescription) return "Готово";
      if (p.hasVideo) return "Добавьте описание";
      if (p.hasDescription) return "Добавьте видео";
      return "Не заполнено";
    },
  },
  {
    id: "materials",
    label: "Материалы",
    icon: FileStack,
    done: (p) => p.materialsCount > 0,
    summary: (p) => (p.materialsCount > 0 ? `${p.materialsCount} файлов` : "Не прикреплены"),
  },
  {
    id: "homework",
    label: "Задание или тест",
    icon: ClipboardList,
    done: (p) => p.hasHomework,
    summary: (p) => {
      if (!p.hasHomework) return "Не создано";
      if (p.homeworkType === "test") return "Тест настроен";
      return "Работа на проверку";
    },
  },
];

export function LessonSetupChecklist(props: LessonSetupChecklistProps) {
  const pending = items.filter((item) => !item.done(props)).length;

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Сборка урока</p>
          <p className="mt-1 text-sm text-stone-500">
            {pending
              ? `Осталось настроить: ${pending} из ${items.length}`
              : "Урок полностью настроен — можно публиковать"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onGoToFirstPending(props)}
          className="text-xs font-bold text-gold hover:underline"
        >
          Перейти к незаполненному
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const complete = item.done(props);
          const active = props.activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onGoTo(item.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-ink bg-ink text-white shadow-soft"
                  : complete
                    ? "border-emerald-100 bg-emerald-50 hover:bg-emerald-100/60"
                    : "border-amber-100 bg-amber-50 hover:bg-amber-100/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon size={16} className={active ? "text-gold" : complete ? "text-emerald-600" : "text-amber-600"} />
                {complete ? (
                  <CheckCircle2 size={16} className={active ? "text-gold" : "text-emerald-600"} />
                ) : (
                  <Circle size={16} className={active ? "text-white/60" : "text-amber-500"} />
                )}
              </div>
              <p className={`mt-3 text-sm font-bold ${active ? "text-white" : "text-ink"}`}>{item.label}</p>
              <p className={`mt-1 text-xs ${active ? "text-white/70" : "text-stone-500"}`}>{item.summary(props)}</p>
              <span className={`mt-3 inline-flex items-center gap-1 text-xs font-bold ${active ? "text-gold" : "text-stone-400"}`}>
                Открыть <ArrowRight size={12} />
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-500">
        <FileText size={14} className="mt-0.5 shrink-0 text-stone-400" />
        Материалы и задание прикрепляются к уроку во вкладках «Материалы» и «Задание и тест». Название, видео и баллы — во вкладке «Настройки».
      </p>
    </section>
  );
}

function onGoToFirstPending(props: LessonSetupChecklistProps) {
  const next = items.find((item) => !item.done(props));
  props.onGoTo(next?.id ?? "content");
}
