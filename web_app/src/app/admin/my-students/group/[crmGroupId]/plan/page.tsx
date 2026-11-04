"use client";

import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StudentMonthlyPlanEditor } from "@/components/student-monthly-plan-editor";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { GroupMonthlyPlanEditor } from "@/components/group-monthly-plan-editor";
import { GroupSectorExamPanel } from "@/components/group-sector-exam-panel";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

export default function GroupPlanPage() {
  const params = useParams<{ crmGroupId: string }>();
  const crmGroupId = params.crmGroupId;
  const groupsResource = useApiResource(() => teacherStudentsApi.groups(), []);
  // Closing the group's sector re-opens the editor on the next sector.
  const [editorKey, setEditorKey] = useState(0);
  const [openedStudents, setOpenedStudents] = useState<Set<string>>(new Set());
  const [legacyOpened, setLegacyOpened] = useState(false);

  if (groupsResource.loading) {
    return <LoadingState label="Открываем план группы" />;
  }

  if (groupsResource.error) {
    return <ErrorState message={groupsResource.error} retry={groupsResource.reload} />;
  }

  const group = groupsResource.data?.groups.find((item) => item.crmGroupId === crmGroupId);
  if (!group) {
    return (
      <EmptyState
        title="Группа не найдена"
        description="Группа больше не назначена вам или её данные ещё обновляются."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/admin/my-students?view=groups"
        className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 transition hover:border-amber-300 hover:text-ink"
      >
        <ArrowLeft size={16} />
        К группам
      </Link>

      <PageHeader
        eyebrow="План обучения группы"
        title={group.name}
        description="Общие темы и материалы занятий. Личные сектора и готовность участников учитываются отдельно."
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-stone-500">
        <span className="inline-flex items-center gap-2">
          <Users size={17} className="text-gold-ink" />
          {group.students.length} участник(ов)
        </span>
        <span>{group.direction || "Направление не указано"}</span>
      </div>

      <GroupMonthlyPlanEditor
        key={editorKey}
        crmGroupId={group.crmGroupId}
        directionTitle={group.direction}
      />

      <section className="mt-6 space-y-3">
        <h2 className="font-display text-2xl">Личные сектора участников</h2>
        <p className="text-sm text-stone-600">Откройте ученика, чтобы выбрать его программу и продолжить следующий сектор независимо от общего плана.</p>
        {group.students.map(student => <details key={student.crmStudentId} onToggle={event => {
          if (event.currentTarget.open) setOpenedStudents(ids => new Set(ids).add(student.crmStudentId));
        }} className="rounded-2xl border border-stone-200 bg-white p-4">
          <summary className="min-h-11 cursor-pointer py-2 text-base font-bold">{student.name}</summary>
          {openedStudents.has(student.crmStudentId) ? <StudentMonthlyPlanEditor crmStudentId={student.crmStudentId} directionTitles={[group.direction]} /> : null}
        </details>)}
      </section>
      <details onToggle={event => { if (event.currentTarget.open) setLegacyOpened(true); }} className="mt-6 rounded-2xl border border-stone-200 p-4">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Прежние общие экзамены группы</summary>
        <p className="mt-2 text-sm text-stone-600">История и незавершённые экзамены прежней модели сохраняются. Новые экзамены готовятся по личным секторам учеников.</p>
        {legacyOpened ? <GroupSectorExamPanel crmGroupId={group.crmGroupId} onSectorClosed={() => setEditorKey((value) => value + 1)} /> : null}
      </details>
    </div>
  );
}
