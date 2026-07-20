"use client";

import { MessageMailbox } from "@/components/message-mailbox";
import { PageHeader } from "@/components/page-header";

export default function TeacherMessagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Кабинет преподавателя"
        title="Сообщения"
        description="Обращения учеников и ваши ответы в одном месте."
      />
      <MessageMailbox role="teacher" />
    </>
  );
}
