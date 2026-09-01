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
      <div className={v2 ? "hidden md:block" : ""}>
        <PageHeader
          eyebrow="Кабинет преподавателя"
          title="Сообщения"
          description={v2 ? "Ученики, родители и учебные группы." : "Обращения учеников и ваши ответы."}
        />
      </div>
      {v2
        ? <LearningDialogMailbox role={isContentAdminRole(user?.role) ? "admin" : "teacher"} />
        : <MessageMailbox role="teacher" />}
    </>
  );
}
