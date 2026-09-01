import type { HomeworkTestAnswerMap, HomeworkTestQuestion } from "./homework-test.js";

export const PREPARED_TEST_PASSING_SCORE = 70;
export const PREPARED_TEST_MAX_ATTEMPTS = null;

export interface PreparedAttemptSummary {
  testId: string;
  score: number;
  passed: boolean;
  createdAt: Date;
}

export function attemptsForTest<T extends { testId: string }>(attempts: T[], testId: string): T[] {
  return attempts.filter((attempt) => attempt.testId === testId);
}

export function hasPassedPreparedTest(attempts: PreparedAttemptSummary[], testId: string): boolean {
  return attempts.some((attempt) => attempt.testId === testId && attempt.passed);
}

export function isPreparedTestUnlocked(
  testIndex: number,
  orderedTestIds: string[],
  attempts: PreparedAttemptSummary[],
): boolean {
  if (testIndex <= 0) return true;
  return orderedTestIds
    .slice(0, testIndex)
    .every((testId) => hasPassedPreparedTest(attempts, testId));
}

export function bestPreparedTestScore(attempts: PreparedAttemptSummary[], testId: string): number | null {
  const scores = attemptsForTest(attempts, testId).map((attempt) => attempt.score);
  return scores.length ? Math.max(...scores) : null;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Keeps option ids stable but changes their display order for every new attempt. */
export function shufflePreparedTestOptions<
  T extends { id: string; options: Array<{ id: string }> },
>(questions: T[], attemptSeed: string): T[] {
  return questions.map((question) => {
    const options = [...question.options];
    for (let index = options.length - 1; index > 0; index -= 1) {
      const swapIndex = stableHash(`${attemptSeed}:${question.id}:${index}`) % (index + 1);
      [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
    }
    return { ...question, options };
  });
}

export function validatePreparedTestDraft(
  questions: HomeworkTestQuestion[],
  answers: HomeworkTestAnswerMap,
  currentQuestion: number,
): void {
  if (!Number.isInteger(currentQuestion) || currentQuestion < 0 || currentQuestion >= questions.length) {
    throw new Error("Некорректный номер вопроса");
  }

  const questionsById = new Map(questions.map((question) => [question.id, question]));
  for (const [questionId, optionId] of Object.entries(answers)) {
    const question = questionsById.get(questionId);
    if (!question || !question.options.some((option) => option.id === optionId)) {
      throw new Error("Некорректный ответ в черновике теста");
    }
  }
}

export function buildPreparedTestReview(
  questions: HomeworkTestQuestion[],
  answers: HomeworkTestAnswerMap,
) {
  return questions.map((question) => ({
    questionId: question.id,
    prompt: question.prompt,
    isCorrect: answers[question.id] === question.correctOptionId,
    selectedOptionText: question.options.find((option) => option.id === answers[question.id])?.text ?? null,
    correctOptionText: question.options.find((option) => option.id === question.correctOptionId)?.text ?? null,
  }));
}
