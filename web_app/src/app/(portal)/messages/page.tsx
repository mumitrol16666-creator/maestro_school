"use client";

import { MessageMailbox } from "@/components/message-mailbox";
import { LearningDialogMailbox } from "@/components/learning-dialog-mailbox";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";

export default function StudentMessagesPage() {
  const { user } = useAuth();
  const v2 = Boolean(user?.productFeatures?.learningDialogsV2);
  return (
    <>
      <div className={v2 ? "hidden md:block" : ""}>
        <PageHeader
          eyebrow="Связь со школой"
          title={v2 ? "Сообщения" : "Обращения"}
          description={v2 ? "Преподаватели, учебные группы и куратор." : "Связь с вашим преподавателем."}
        />
      </div>
      {v2 ? <LearningDialogMailbox role="student" /> : <MessageMailbox role="student" />}
    </>
  );
}
