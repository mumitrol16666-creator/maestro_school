"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LearningDialogMailbox } from "@/components/learning-dialog-mailbox";
import { LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";

export default function FamilyMessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const enabled = Boolean(user?.productFeatures?.learningDialogsV2);

  useEffect(() => {
    if (!loading && !enabled) router.replace("/family");
  }, [enabled, loading, router]);

  if (loading || !enabled) return <LoadingState label="Открываем семейный кабинет" />;
  return (
    <>
      <div className="hidden md:block">
        <PageHeader eyebrow="Связь с преподавателем" title="Сообщения" description="Общая переписка родителей с постоянным преподавателем." />
      </div>
      <LearningDialogMailbox role="parent" />
    </>
  );
}
