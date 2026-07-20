"use client";

import { MessageMailbox } from "@/components/message-mailbox";
import { PageHeader } from "@/components/page-header";

export default function StudentMessagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Связь со школой"
        title="Обращения"
        description="Задайте вопрос своему преподавателю. Ответ появится здесь и в уведомлениях."
      />
      <MessageMailbox role="student" />
    </>
  );
}
