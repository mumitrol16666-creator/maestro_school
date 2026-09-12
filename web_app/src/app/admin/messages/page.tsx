"use client";

import { MessageMailbox } from "@/components/message-mailbox";
import { LearningDialogMailbox } from "@/components/learning-dialog-mailbox";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { isContentAdminRole } from "@/lib/role-labels";

export default function TeacherMessagesPage() {
  const { user } = useAuth();
  const v2 = Boolean(user?.productFeatures?.learningDialogsV2);
  return (
    <>
      {!v2 && (
        <PageHeader
          eyebrow="Кабинет преподавателя"
          title="Сообщения"
          description="Обращения учеников и ваши ответы."
        />
      )}
      {v2
        ? <LearningDialogMailbox role={isContentAdminRole(user?.role) ? "admin" : "teacher"} />
        : <MessageMailbox role="teacher" />}
    </>
  );
}
