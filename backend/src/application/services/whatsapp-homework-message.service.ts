import { AppError } from "../../domain/errors.js";
import {
  fetchClassCard,
  fetchClassStudents,
} from "../../infrastructure/crm/crm-client.js";
import { mergeOfflineLessonStudentChecks } from "./offline-lesson-student-check.service.js";

type HomeworkRecipient = {
  phone: string;
  label: string;
  audience: "student" | "parent" | "family";
  recipientName?: string | null;
  source: "primary" | "additional";
};

export type WhatsappHomeworkMessageInput = {
  topic?: string | null;
  lessonSummary?: string | null;
  homework?: string | null;
};

export type WhatsappHomeworkMessageDraft = {
  crmStudentId: string;
  studentName: string;
  recipient: HomeworkRecipient | null;
  message: string | null;
  source: "template" | "unavailable";
  note?: string;
};

function cleanText(value?: string | null) {
  return String(value || "").trim();
}

export function fallbackWhatsappHomeworkMessage(input: WhatsappHomeworkMessageInput) {
  const sections = [
    ["Тема урока", input.topic],
    ["Домашнее задание", input.homework],
    ["Итог урока", input.lessonSummary],
  ]
    .map(([label, value]) => [label, cleanText(value)])
    .filter((entry) => entry[1])
    .map(([label, value]) => `*${label}:*\n${value}`);

  return sections.join("\n\n");
}

export async function generateWhatsappHomeworkDrafts(crmClassId: string, studentId?: string) {
  const [lesson, roster] = await Promise.all([
    fetchClassCard(crmClassId) as Promise<{
      status?: string;
      topic?: string | null;
      lessonSummary?: string | null;
      homeworkDraft?: string | null;
    }>,
    fetchClassStudents(crmClassId),
  ]);
  if (lesson.status !== "completed") {
    throw new AppError(
      409,
      "Сообщения можно подготовить после завершения и проверки урока.",
    );
  }
  const merged = await mergeOfflineLessonStudentChecks(crmClassId, roster);
  const students = studentId
    ? merged.students.filter((student) => student.crmStudentId === studentId)
    : merged.students;
  if (studentId && students.length === 0) {
    throw new AppError(404, "Ученик не найден в этом уроке.");
  }

  const message = fallbackWhatsappHomeworkMessage({
    topic: lesson.topic,
    lessonSummary: lesson.lessonSummary,
    homework: lesson.homeworkDraft,
  });

  return students.map((student): WhatsappHomeworkMessageDraft => {
    const recipient = student.homeworkRecipient ?? null;
    if (!recipient?.phone) {
      return {
        crmStudentId: student.crmStudentId,
        studentName: student.name,
        recipient: null,
        message: null,
        source: "unavailable",
        note: "Для домашних заданий не выбран номер получателя.",
      };
    }

    return {
      crmStudentId: student.crmStudentId,
      studentName: student.name,
      recipient,
      message,
      source: "template",
    };
  });
}
