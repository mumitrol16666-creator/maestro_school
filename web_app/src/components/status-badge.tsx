import { lessonStatusLabels, lessonStatusStyles } from "@/lib/ui";
import { LessonStatus } from "@/types";

export function StatusBadge({ status }: { status: LessonStatus }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${lessonStatusStyles[status]}`}>
      {lessonStatusLabels[status]}
    </span>
  );
}
