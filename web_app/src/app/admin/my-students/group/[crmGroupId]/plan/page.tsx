"use client";

import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { GroupMonthlyPlanEditor } from "@/components/group-monthly-plan-editor";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

export default function GroupPlanPage() {
  const params = useParams<{ crmGroupId: string }>();
  const crmGroupId = params.crmGroupId;
  const groupsResource = useApiResource(() => teacherStudentsApi.groups(), []);

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
        eyebrow="Учебный план группы"
        title={group.name}
        description="Общая цель, темы, прогресс и материалы для всех участников группы."
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-stone-500">
        <span className="inline-flex items-center gap-2">
          <Users size={17} className="text-gold" />
          {group.students.length} участник(ов)
        </span>
        <span>{group.direction || "Направление не указано"}</span>
      </div>

      <GroupMonthlyPlanEditor
        crmGroupId={group.crmGroupId}
        directionTitle={group.direction}
      />
    </div>
  );
}
