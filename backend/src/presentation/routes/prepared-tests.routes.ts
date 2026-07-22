import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import {
  gradeHomeworkTest,
  publicHomeworkTestQuestions,
  type HomeworkTestAnswerMap,
} from "../../domain/homework-test.js";
import { listPreparedTestTemplates } from "../../domain/prepared-tests.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { authenticate, requireStudent } from "../guards/auth.guards.js";

const testIdSchema = z.object({ testId: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/) });
const submitSchema = z.object({
  answers: z.record(z.string().min(1), z.string().min(1)),
});
const PASSING_SCORE = 70;

type Attempt = Awaited<ReturnType<typeof listAttempts>>[number];

async function listAttempts(studentId: string) {
  return prisma.preparedTestAttempt.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });
}

function getTemplate(testId: string) {
  const template = listPreparedTestTemplates().find((item) => item.id === testId);
  if (!template) throw new NotFoundError("Prepared test");
  return template;
}

function hasPassed(attempts: Attempt[], testId: string) {
  return attempts.some((attempt) => attempt.testId === testId && attempt.passed);
}

function latestAttempt(attempts: Attempt[], testId: string) {
  return attempts.find((attempt) => attempt.testId === testId) ?? null;
}

function isUnlocked(testIndex: number, attempts: Attempt[]) {
  const templates = listPreparedTestTemplates();
  return templates.slice(0, testIndex).every((template) => hasPassed(attempts, template.id));
}

function buildProgress(attempts: Attempt[]) {
  const templates = listPreparedTestTemplates();
  return templates.map((template, index) => {
    const latest = latestAttempt(attempts, template.id);
    const passed = hasPassed(attempts, template.id);
    const unlocked = isUnlocked(index, attempts);
    return {
      id: template.id,
      title: template.title,
      description: template.description,
      order: index + 1,
      questionCount: template.questions.length,
      passingScore: PASSING_SCORE,
      locked: !unlocked && !passed,
      available: unlocked && !passed,
      passed,
      score: latest?.score ?? null,
      attempts: attempts.filter((attempt) => attempt.testId === template.id).length,
      lastAttemptAt: latest?.createdAt ?? null,
    };
  });
}

export async function preparedTestsRoutes(app: FastifyInstance) {
  app.get(
    "/tests",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const attempts = await listAttempts(request.user!.id);
      const tests = buildProgress(attempts);
      return {
        data: {
          tests,
          total: tests.length,
          completedCount: tests.filter((test) => test.passed).length,
        },
      };
    },
  );

  app.get(
    "/tests/:testId",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const { testId } = testIdSchema.parse(request.params);
      const template = getTemplate(testId);
      const attempts = await listAttempts(request.user!.id);
      const index = listPreparedTestTemplates().findIndex((item) => item.id === testId);
      if (!isUnlocked(index, attempts) && !hasPassed(attempts, testId)) {
        throw new ForbiddenError("Сначала пройдите предыдущий тест");
      }
      const latest = latestAttempt(attempts, testId);
      return {
        data: {
          id: template.id,
          title: template.title,
          description: template.description,
          order: index + 1,
          totalTests: listPreparedTestTemplates().length,
          questionCount: template.questions.length,
          passingScore: PASSING_SCORE,
          questions: publicHomeworkTestQuestions(template.questions),
          passed: hasPassed(attempts, testId),
          latestAttempt: latest
            ? {
                score: latest.score,
                correctAnswers: latest.correctAnswers,
                totalQuestions: latest.totalQuestions,
                passed: latest.passed,
                attemptNumber: latest.attemptNumber,
                createdAt: latest.createdAt,
              }
            : null,
        },
      };
    },
  );

  app.post(
    "/tests/:testId/attempts",
    { preHandler: [authenticate, requireStudent] },
    async (request, reply) => {
      const { testId } = testIdSchema.parse(request.params);
      const body = submitSchema.parse(request.body);
      const template = getTemplate(testId);
      const studentId = request.user!.id;
      const attempts = await listAttempts(studentId);
      const index = listPreparedTestTemplates().findIndex((item) => item.id === testId);
      if (!isUnlocked(index, attempts) && !hasPassed(attempts, testId)) {
        throw new ForbiddenError("Сначала пройдите предыдущий тест");
      }
      if (hasPassed(attempts, testId)) {
        throw new ConflictError("Этот тест уже пройден");
      }

      const result = gradeHomeworkTest(template.questions, body.answers as HomeworkTestAnswerMap);
      const passed = result.score >= PASSING_SCORE;
      const attempt = await prisma.preparedTestAttempt.create({
        data: {
          testId,
          studentId,
          attemptNumber: attempts.filter((item) => item.testId === testId).length + 1,
          score: result.score,
          correctAnswers: result.correctAnswers,
          totalQuestions: result.totalQuestions,
          passed,
          answers: body.answers,
        },
      });
      const nextTest = passed ? listPreparedTestTemplates()[index + 1] ?? null : null;
      return reply.status(201).send({
        data: {
          id: attempt.id,
          testId,
          attemptNumber: attempt.attemptNumber,
          score: result.score,
          correctAnswers: result.correctAnswers,
          totalQuestions: result.totalQuestions,
          passed,
          passingScore: PASSING_SCORE,
          nextTest: nextTest ? { id: nextTest.id, title: nextTest.title } : null,
          createdAt: attempt.createdAt,
        },
      });
    },
  );
}
