"use client";

import { ArrowLeft, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { StudentMonthlyPlanEditor } from "@/components/student-monthly-plan-editor";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatFio } from "@/lib/name";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

export default function StudentPlanPage() {
  const params = useParams<{ crmStudentId: string }>();
  const crmStudentId = params.crmStudentId;
  const studentsResource = useApiResource(() => teacherStudentsApi.list(), []);

  if (studentsResource.loading) {
    return <LoadingState label="Открываем учебный план" />;
  }

  if (studentsResource.error) {
    return <ErrorState message={studentsResource.error} retry={studentsResource.reload} />;
  }

  const student = studentsResource.data?.students.find((item) => item.crmStudentId === crmStudentId);
  if (!student) {
    return (
      <EmptyState
        title="Ученик не найден"
        description="Ученик больше не закреплён за вами или его данные ещё обновляются."
      />
    );
  }

  const displayName = formatFio(student) || student.name;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/admin/my-students"
        className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 transition hover:border-amber-300 hover:text-ink"
      >
        <ArrowLeft size={16} />
        К ученикам
      </Link>

      <PageHeader
        eyebrow="Учебный план ученика"
        title={displayName}
        description="Цель месяца, темы, прогресс и домашние задания в одном рабочем экране."
      />

      <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-stone-500">
        <GraduationCap size={17} className="text-gold" />
        {student.directions.join(" · ") || "Направление не указано"}
      </div>

      <StudentMonthlyPlanEditor
        crmStudentId={crmStudentId}
        directionTitles={student.directions}
      />
    </div>
  );
}
