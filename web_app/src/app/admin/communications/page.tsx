"use client";

import Link from "next/link";
import { MessagesSquare, Newspaper } from "lucide-react";
import { AdminWorkspaceHub } from "@/components/admin-workspace";
import { LearningDialogMailbox } from "@/components/learning-dialog-mailbox";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";

export default function AdminCommunicationsPage() {
  const { user } = useAuth();
  if (user?.productFeatures?.learningDialogsV2) {
    return (
      <>
        <div className="hidden md:block">
          <PageHeader eyebrow="Рабочий кабинет" title="Коммуникации" description="Диалоги и новости школы в одном разделе." />
          <nav aria-label="Разделы коммуникаций" className="mb-5 flex flex-wrap gap-2">
            <Link
              href="/admin/communications"
              aria-current="page"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white"
            >
              <MessagesSquare size={17} />
              Диалоги
            </Link>
            <Link
              href="/admin/news"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700"
            >
              <Newspaper size={17} />
              Новости школы
            </Link>
          </nav>
        </div>
        <LearningDialogMailbox role="admin" />
      </>
    );
  }
  return <AdminWorkspaceHub sectionId="communications" />;
}
