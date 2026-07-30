import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackWhatsappHomeworkMessage,
} from "./whatsapp-homework-message.service.js";

test("after-lesson message contains only topic, homework and summary", () => {
  const message = fallbackWhatsappHomeworkMessage({
    topic: "Смена аккордов",
    lessonSummary: "Отработали переходы между аккордами",
    homework: "Повторить упражнение в медленном темпе",
  });

  assert.equal(
    message,
    [
      "*Тема урока:*\nСмена аккордов",
      "*Домашнее задание:*\nПовторить упражнение в медленном темпе",
      "*Итог урока:*\nОтработали переходы между аккордами",
    ].join("\n\n"),
  );
  assert.doesNotMatch(message, /куратор|преподавател|AI/i);
});
