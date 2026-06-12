"use client";

import { CheckCircle2 } from "lucide-react";
import type { LessonWorkspaceTab } from "./lesson-workspace";

interface LessonSetupChecklistProps {
  hasVideo: boolean;
  hasDescription: boolean;
  materialsCount: number;
  hasHomework: boolean;
  onGoTo: (tab: LessonWorkspaceTab) => void;
}

function firstPendingTab(props: LessonSetupChecklistProps): LessonWorkspaceTab {
  if (!props.hasVideo || !props.hasDescription) return "settings";
  if (props.materialsCount === 0) return "materials";
  if (!props.hasHomework) return "homework";
  return "content";
}

export function LessonSetupChecklist(props: LessonSetupChecklistProps) {
  const steps = [
    props.hasVideo && props.hasDescription,
    props.materialsCount > 0,
    props.hasHomework,
  ];
  const done = steps.filter(Boolean).length;
  const total = steps.length;
  const complete = done === total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-stone-600">
        {complete ? (
          <CheckCircle2 size={16} className="text-emerald-600" />
        ) : null}
        <span>
          {complete
            ? "Урок настроен — можно публиковать"
            : `Сборка урока: ${done} из ${total} готово`}
        </span>
      </div>
      {!complete ? (
        <button
          type="button"
          onClick={() => props.onGoTo(firstPendingTab(props))}
          className="text-xs font-bold text-gold hover:underline"
        >
          Перейти к незаполненному
        </button>
      ) : null}
    </div>
  );
}
