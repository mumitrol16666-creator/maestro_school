"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { LearningHomeworkCard } from "@/components/learning-homework-card";
import { LegacySchoolHomework } from "@/components/student-school-homework-legacy";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import { schoolHomeworkReviewState } from "@/lib/school-homework-state";
import { markSchoolAlertsSeen } from "@/lib/student-school-alerts";

// The task list owns discovery; this route owns the assignment, materials and submission.
export default function SchoolTaskPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const homework = useApiResource(
    () => learningHomeworkApi.studentAssignments(),
    [],
  );
  const school = useApiResource(() => api.studentOfflineSummary(), []);
  const assignments = homework.data?.assignments ?? [];
  const exact = assignments.find((item) => item.id === id);
  const related = exact
    ? [exact]
    : assignments.filter((item) => item.sourceLessonId === id);
  const lessons = school.data?.lessonHistory ?? [];
  const legacy = lessons.find(
    (item) => item.crmClassId === id && item.homework?.trim(),
  );

  useEffect(() => {
    if (user && school.data && (related.length || legacy)) {
      markSchoolAlertsSeen(user.id, school.data, "homework");
    }
  }, [user, school.data, related.length, legacy]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/tasks?source=offline"
        className="mb-3 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-stone-600 focus-visible:ring-2 focus-visible:ring-gold"
      >
        ← Все задания
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Задание с преподавателем</h1>
      {homework.loading ? (
        <LoadingState label="Загружаем задание" />
      ) : homework.error ? (
        <ErrorState message={homework.error} retry={homework.reload} />
      ) : related.length ? (
        <div className="space-y-3">
          {related.map((assignment) => (
            <LearningHomeworkCard
              key={assignment.id}
              assignment={assignment}
              compact
              defaultOpen
              onSubmitted={homework.reload}
            />
          ))}
        </div>
      ) : school.loading ? (
        <LoadingState label="Загружаем задание из урока" />
      ) : school.error ? (
        <ErrorState message={school.error} retry={school.reload} />
      ) : legacy ? (
        <LegacySchoolHomework
          key={legacy.crmClassId}
          lesson={legacy}
          reviewState={schoolHomeworkReviewState(legacy, lessons)}
          defaultOpen
        />
      ) : (
        <p
          role="status"
          className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-600"
        >
          Задание не найдено среди доступных. Проверьте список заданий или
          уточните у преподавателя.
        </p>
      )}
    </div>
  );
}
