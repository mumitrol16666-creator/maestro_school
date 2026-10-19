"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { StudentWorkspaceCard } from "@/components/student-workspace-card";
import type { WorkspaceTab } from "@/types/teacher-student-workspace";

const tabKeys: WorkspaceTab[] = ["now", "activity", "dynamics", "tasks", "dialog"];

export default function TeacherStudentPage() {
  const { crmStudentId } = useParams<{ crmStudentId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("tab");
  const initialTab = tabKeys.includes(requested as WorkspaceTab) ? (requested as WorkspaceTab) : "now";

  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="teacher-student-page">
      <Link
        href="/admin/my-students"
        className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold text-stone-600 transition hover:border-amber-300 hover:text-ink"
      >
        <ArrowLeft size={16} />
        К ученикам
      </Link>
      <StudentWorkspaceCard
        crmStudentId={crmStudentId}
        initialTab={initialTab}
        onTabChange={(tab) => router.replace(`/admin/my-students/student/${encodeURIComponent(crmStudentId)}?tab=${tab}`, { scroll: false })}
      />
    </div>
  );
}
