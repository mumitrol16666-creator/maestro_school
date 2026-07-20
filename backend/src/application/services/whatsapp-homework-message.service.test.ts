import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsappHomeworkMessages,
  fallbackWhatsappHomeworkMessage,
} from "./whatsapp-homework-message.service.js";

test("parent homework message points questions to the curator", () => {
  const message = fallbackWhatsappHomeworkMessage({
    studentFirstName: "Дима",
    recipient: {
      phone: "+77000000000",
      label: "Мама Алла",
      audience: "parent",
      recipientName: "Алла",
      source: "additional",
    },
    topic: "Смена аккордов",
    lessonSummary: "Отработали переходы между аккордами",
    homework: "Повторить упражнение в медленном темпе",
    homeworkReview: {
      status: "partial",
      completionPercent: 60,
      difficulties: "Переход между Am и C пока требует паузы",
    },
  });

  assert.match(message, /^Здравствуйте, Алла!/);
  assert.match(message, /выполнено частично/);
  assert.match(message, /куратору/);
  assert.doesNotMatch(message, /напишите преподавателю/i);
});

test("student prompt explicitly forbids directing questions to the teacher", () => {
  const messages = buildWhatsappHomeworkMessages({
    studentFirstName: "Дима",
    recipient: {
      phone: "+77000000000",
      label: "Ученик",
      audience: "student",
      recipientName: "Дима",
      source: "primary",
    },
    topic: "Ритм",
    homework: "Повторить упражнение",
  });

  assert.match(messages[0].content, /Не предлагай писать преподавателю/);
  assert.match(messages[0].content, /куратору/);
});
