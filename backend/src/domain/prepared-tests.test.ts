import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preparedTestTemplates } from "./prepared-tests.js";

describe("prepared test answer quality", () => {
  const questions = preparedTestTemplates.flatMap((template) => template.questions);

  it("keeps every question and option id unique", () => {
    assert.equal(questions.length, 125);
    assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
    for (const question of questions) {
      assert.equal(new Set(question.options.map((option) => option.id)).size, question.options.length);
      assert.equal(new Set(question.options.map((option) => option.text)).size, question.options.length);
      assert.ok(question.options.some((option) => option.id === question.correctOptionId));
    }
  });

  it("does not systematically reveal the answer by text length", () => {
    const uniqueLongestCorrect = questions.filter((question) => {
      const correctLength = question.options
        .find((option) => option.id === question.correctOptionId)?.text.length ?? 0;
      const maximum = Math.max(...question.options.map((option) => option.text.length));
      return correctLength === maximum
        && question.options.filter((option) => option.text.length === maximum).length === 1;
    });
    const uniqueShortestCorrect = questions.filter((question) => {
      const correctLength = question.options
        .find((option) => option.id === question.correctOptionId)?.text.length ?? 0;
      const minimum = Math.min(...question.options.map((option) => option.text.length));
      return correctLength === minimum
        && question.options.filter((option) => option.text.length === minimum).length === 1;
    });

    assert.ok(uniqueLongestCorrect.length <= Math.ceil(questions.length * 0.1));
    assert.ok(uniqueShortestCorrect.length <= Math.ceil(questions.length * 0.25));
  });
});
