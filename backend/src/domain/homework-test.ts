import { BadRequestError } from "./errors.js";

export interface HomeworkTestOption {
  id: string;
  text: string;
}

export interface HomeworkTestQuestion {
  id: string;
  prompt: string;
  options: HomeworkTestOption[];
  correctOptionId: string;
}

export type HomeworkTestAnswerMap = Record<string, string>;

export function parseHomeworkTestQuestions(value: unknown): HomeworkTestQuestion[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestError("В тесте пока нет вопросов");
  }

  return value as HomeworkTestQuestion[];
}

export function publicHomeworkTestQuestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return (value as HomeworkTestQuestion[]).map(({ correctOptionId: _correctOptionId, ...question }) => question);
}

export function gradeHomeworkTest(questions: HomeworkTestQuestion[], answers: HomeworkTestAnswerMap) {
  const unanswered = questions.filter((question) => !answers[question.id]);
  if (unanswered.length) {
    throw new BadRequestError("Ответьте на все вопросы теста");
  }

  const correctAnswers = questions.filter(
    (question) => answers[question.id] === question.correctOptionId,
  ).length;
  const score = Math.round((correctAnswers / questions.length) * 100);

  return { score, correctAnswers, totalQuestions: questions.length };
}
