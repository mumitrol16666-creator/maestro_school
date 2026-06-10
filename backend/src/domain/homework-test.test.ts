import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gradeHomeworkTest,
  publicHomeworkTestQuestions,
  type HomeworkTestQuestion,
} from "./homework-test.js";

const questions: HomeworkTestQuestion[] = [
  {
    id: "q1",
    prompt: "Первая струна гитары?",
    correctOptionId: "e",
    options: [{ id: "e", text: "Ми" }, { id: "a", text: "Ля" }],
  },
  {
    id: "q2",
    prompt: "Сколько струн у классической гитары?",
    correctOptionId: "six",
    options: [{ id: "six", text: "6" }, { id: "four", text: "4" }],
  },
];

describe("homework test", () => {
  it("calculates percentage from answers", () => {
    assert.deepEqual(gradeHomeworkTest(questions, { q1: "e", q2: "four" }), {
      score: 50,
      correctAnswers: 1,
      totalQuestions: 2,
    });
  });

  it("does not expose correct answers to students", () => {
    const publicQuestions = publicHomeworkTestQuestions(questions);
    assert.equal("correctOptionId" in publicQuestions[0], false);
  });

  it("requires an answer for every question", () => {
    assert.throws(() => gradeHomeworkTest(questions, { q1: "e" }), /Ответьте на все вопросы/);
  });
});
