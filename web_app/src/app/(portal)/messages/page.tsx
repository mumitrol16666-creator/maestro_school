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
      {!v2 && (
        <PageHeader
          eyebrow="Связь со школой"
          title="Обращения"
          description="Связь с вашим преподавателем."
        />
      )}
      {v2 ? <LearningDialogMailbox role="student" /> : <MessageMailbox role="student" />}
    </>
  );
}
