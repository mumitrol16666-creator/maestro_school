import { env } from "../../config/env.js";
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

type HomeworkReview = {
  status: "not_checked" | "completed" | "partial" | "not_completed" | "not_assigned";
  completionPercent?: number | null;
  difficulties?: string | null;
  notCompletedReason?: string | null;
};

export type WhatsappHomeworkMessageInput = {
  studentFirstName: string;
  recipient: HomeworkRecipient;
  topic?: string | null;
  lessonSummary?: string | null;
  homework?: string | null;
  attendanceStatus?: string | null;
  homeworkReview?: HomeworkReview | null;
  teacherNote?: string | null;
};

export type WhatsappHomeworkMessageDraft = {
  crmStudentId: string;
  studentName: string;
  recipient: HomeworkRecipient | null;
  message: string | null;
  source: "ai" | "template" | "unavailable";
  model: string | null;
  note?: string;
};

const homeworkStatusText: Record<HomeworkReview["status"], string> = {
  not_checked: "не проверялось",
  completed: "выполнено",
  partial: "выполнено частично",
  not_completed: "не выполнено",
  not_assigned: "не задавалось",
};

function firstName(value?: string | null) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "ученик";
}

function cleanText(value?: string | null) {
  return String(value || "").trim();
}

function sentence(value: string) {
  const text = cleanText(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function fallbackWhatsappHomeworkMessage(input: WhatsappHomeworkMessageInput) {
  const recipientName = cleanText(input.recipient.recipientName);
  const studentName = cleanText(input.studentFirstName) || "ученик";
  const isStudent = input.recipient.audience === "student";
  const greeting = isStudent
    ? `Привет, ${recipientName || studentName}!`
    : recipientName
      ? `Здравствуйте, ${recipientName}!`
      : "Здравствуйте!";
  const subject = isStudent ? "Сегодня на уроке" : `Сегодня ${studentName} на уроке`;
  const lessonFact = cleanText(input.lessonSummary) || cleanText(input.topic);
  const review = input.homeworkReview;
  const reviewText = review && review.status !== "not_checked" && review.status !== "not_assigned"
    ? `Прошлое домашнее задание ${homeworkStatusText[review.status]}${
        review.completionPercent != null && review.status === "partial"
          ? ` примерно на ${review.completionPercent}%`
          : ""
      }.`
    : "";
  const reviewDetail = review?.status === "partial"
    ? sentence(review.difficulties || "")
    : review?.status === "not_completed"
      ? sentence(review.notCompletedReason || "")
      : "";
  const homeworkText = cleanText(input.homework)
    ? `${isStudent ? "До следующего занятия" : "Домашнее задание до следующего урока"}: ${sentence(input.homework || "")}`
    : "";

  return [
    greeting,
    lessonFact ? `${subject}: ${sentence(lessonFact)}` : "",
    reviewText,
    reviewDetail,
    homeworkText,
    isStudent
      ? "Если появятся трудности или вопросы, напиши куратору. Ждём тебя на следующем уроке!"
      : "Если появятся вопросы или трудности, напишите куратору. Хорошего дня!",
  ].filter(Boolean).join(" ");
}

export function buildWhatsappHomeworkMessages(input: WhatsappHomeworkMessageInput) {
  return [
    {
      role: "system",
      content: [
        "Ты редактор сообщений музыкальной школы Maestro.",
        "Составь короткое, тёплое WhatsApp-сообщение на русском языке.",
        "Используй только переданные факты и ничего не придумывай.",
        "Не ставь диагнозов, не стыди ученика и не скрывай факт невыполненного задания.",
        "Преподаватель не переписывается с семьёй напрямую.",
        "По любым вопросам и трудностям предлагай написать куратору или написать нам.",
        "Не предлагай писать преподавателю.",
        "Если получатель parent или family, обращайся уважительно и рассказывай об ученике в третьем лице.",
        "Если получатель student, обращайся на ты, дружелюбно и без фамильярности.",
        "Пиши 3-6 коротких предложений, без Markdown, списков, эмодзи и служебных пояснений.",
        "Верни только готовый текст сообщения.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        recipient: {
          audience: input.recipient.audience,
          name: input.recipient.recipientName || null,
          label: input.recipient.label,
        },
        student: { firstName: input.studentFirstName },
        lesson: {
          topic: input.topic || null,
          summary: input.lessonSummary || null,
          homework: input.homework || null,
          attendanceStatus: input.attendanceStatus || null,
          teacherNote: input.teacherNote || null,
        },
        previousHomework: input.homeworkReview
          ? {
              status: homeworkStatusText[input.homeworkReview.status],
              completionPercent: input.homeworkReview.completionPercent ?? null,
              difficulties: input.homeworkReview.difficulties || null,
              notCompletedReason: input.homeworkReview.notCompletedReason || null,
            }
          : null,
      }),
    },
  ];
}

async function generateWithOpenAi(input: WhatsappHomeworkMessageInput) {
  if (!env.OPENAI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.WHATSAPP_MESSAGE_AI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.WHATSAPP_MESSAGE_AI_MODEL,
        temperature: 0.75,
        max_tokens: 260,
        messages: buildWhatsappHomeworkMessages(input),
      }),
    });
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message || `OpenAI request failed (${response.status})`);
    }
    const message = cleanText(body.choices?.[0]?.message?.content);
    if (message.length < 20 || message.length > 2000) {
      throw new Error("OpenAI returned an invalid WhatsApp draft");
    }
    return message;
  } finally {
    clearTimeout(timeout);
  }
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

  return Promise.all(students.map(async (student): Promise<WhatsappHomeworkMessageDraft> => {
    const recipient = student.homeworkRecipient ?? null;
    if (!recipient?.phone) {
      return {
        crmStudentId: student.crmStudentId,
        studentName: student.name,
        recipient: null,
        message: null,
        source: "unavailable",
        model: null,
        note: "Для домашних заданий не выбран номер получателя.",
      };
    }

    const input: WhatsappHomeworkMessageInput = {
      studentFirstName: student.firstName || firstName(student.name),
      recipient,
      topic: lesson.topic,
      lessonSummary: lesson.lessonSummary,
      homework: lesson.homeworkDraft,
      attendanceStatus: student.attendanceStatus,
      homeworkReview: student.homeworkReview,
      teacherNote: student.teacherNote,
    };

    try {
      const aiMessage = await generateWithOpenAi(input);
      if (aiMessage) {
        return {
          crmStudentId: student.crmStudentId,
          studentName: student.name,
          recipient,
          message: aiMessage,
          source: "ai",
          model: env.WHATSAPP_MESSAGE_AI_MODEL,
        };
      }
    } catch (error) {
      console.warn("[whatsapp-homework-ai] generation failed", {
        crmClassId,
        crmStudentId: student.crmStudentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      crmStudentId: student.crmStudentId,
      studentName: student.name,
      recipient,
      message: fallbackWhatsappHomeworkMessage(input),
      source: "template",
      model: null,
      note: env.OPENAI_API_KEY
        ? "Не удалось обновить формулировку, поэтому подготовлен обычный черновик."
        : "Подготовлен обычный черновик. Его можно изменить перед отправкой.",
    };
  }));
}
