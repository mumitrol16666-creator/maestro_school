import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { awardPreparedTestXp } from "../../application/services/weekly-league.service.js";
import {
  WEEKLY_PREPARED_TEST_FIRST_ATTEMPT_XP,
  WEEKLY_PREPARED_TEST_LIMIT,
  WEEKLY_PREPARED_TEST_RETRY_XP,
} from "../../application/services/weekly-league-policy.js";
import { evaluateAchievements } from "../../application/services/achievement.service.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import {
  gradeHomeworkTest,
  publicHomeworkTestQuestions,
  type HomeworkTestAnswerMap,
} from "../../domain/homework-test.js";
import {
  attemptsForTest,
  bestPreparedTestScore,
  buildPreparedTestReview,
  hasPassedPreparedTest,
  isPreparedTestUnlocked,
  PREPARED_TEST_MAX_ATTEMPTS,
  PREPARED_TEST_PASSING_SCORE,
  shufflePreparedTestOptions,
  validatePreparedTestDraft,
} from "../../domain/prepared-test-progress.js";
import { listPreparedTestTemplates } from "../../domain/prepared-tests.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  authenticate,
  requireContentAdmin,
  requireStudent,
} from "../guards/auth.guards.js";

const testIdSchema = z.object({
  testId: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
});
const answersSchema = z.record(z.string().min(1), z.string().min(1));
const submitSchema = z.object({ answers: answersSchema });
const draftSchema = z.object({
  answers: answersSchema,
  currentQuestion: z.number().int().min(0),
});

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

function latestAttempt(attempts: Attempt[], testId: string) {
  return attemptsForTest(attempts, testId)[0] ?? null;
}

function assertTestAccess(testId: string, attempts: Attempt[]) {
  const templates = listPreparedTestTemplates();
  const index = templates.findIndex((item) => item.id === testId);
  if (!isPreparedTestUnlocked(index, templates.map((item) => item.id), attempts)) {
    throw new ForbiddenError("Сначала пройдите предыдущий тест");
  }
  return index;
}

function attemptsRemaining() {
  return null;
}

function buildProgress(attempts: Attempt[]) {
  const templates = listPreparedTestTemplates();
  const orderedIds = templates.map((item) => item.id);
  return templates.map((template, index) => {
    const testAttempts = attemptsForTest(attempts, template.id);
    const latest = latestAttempt(attempts, template.id);
    const passed = hasPassedPreparedTest(attempts, template.id);
    const unlocked = isPreparedTestUnlocked(index, orderedIds, attempts);
    const remaining = attemptsRemaining();
    return {
      id: template.id,
      title: template.title,
      description: template.description,
      order: index + 1,
      section: template.title.split(".")[0],
      questionCount: template.questions.length,
      passingScore: PREPARED_TEST_PASSING_SCORE,
      maxAttempts: PREPARED_TEST_MAX_ATTEMPTS,
      locked: !unlocked,
      available: unlocked,
      exhausted: false,
      passed,
      bestScore: bestPreparedTestScore(attempts, template.id),
      latestScore: latest?.score ?? null,
      attemptsUsed: testAttempts.length,
      attemptsRemaining: remaining,
      lastAttemptAt: latest?.createdAt ?? null,
    };
  });
}

function validateDraftOrThrow(
  questions: Parameters<typeof validatePreparedTestDraft>[0],
  answers: HomeworkTestAnswerMap,
  currentQuestion: number,
) {
  try {
    validatePreparedTestDraft(questions, answers, currentQuestion);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "Некорректный черновик теста");
  }
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
          xpRules: {
            firstAttempt: WEEKLY_PREPARED_TEST_FIRST_ATTEMPT_XP,
            retry: WEEKLY_PREPARED_TEST_RETRY_XP,
            weeklyLimit: WEEKLY_PREPARED_TEST_LIMIT,
          },
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
      const studentId = request.user!.id;
      const [attempts, draft, xpEvent] = await Promise.all([
        listAttempts(studentId),
        prisma.preparedTestDraft.findUnique({ where: { studentId_testId: { studentId, testId } } }),
        prisma.leagueXpEvent.findUnique({
          where: { sourceKey: `prepared-test:${studentId}:${testId}` },
          select: { amount: true },
        }),
      ]);
      const index = assertTestAccess(testId, attempts);
      const latest = latestAttempt(attempts, testId);
      const passed = hasPassedPreparedTest(attempts, testId);
      const remaining = attemptsRemaining();
      const latestAnswers = (latest?.answers ?? {}) as HomeworkTestAnswerMap;
      const nextTemplate = passed ? listPreparedTestTemplates()[index + 1] ?? null : null;
      return {
        data: {
          id: template.id,
          title: template.title,
          description: template.description,
          order: index + 1,
          totalTests: listPreparedTestTemplates().length,
          questionCount: template.questions.length,
          passingScore: PREPARED_TEST_PASSING_SCORE,
          maxAttempts: PREPARED_TEST_MAX_ATTEMPTS,
          xpRules: {
            firstAttempt: WEEKLY_PREPARED_TEST_FIRST_ATTEMPT_XP,
            retry: WEEKLY_PREPARED_TEST_RETRY_XP,
            weeklyLimit: WEEKLY_PREPARED_TEST_LIMIT,
          },
          earnedXp: xpEvent?.amount ?? 0,
          questions: shufflePreparedTestOptions(
            publicHomeworkTestQuestions(template.questions),
            `${studentId}:${testId}:${attemptsForTest(attempts, testId).length + 1}`,
          ),
          passed,
          exhausted: false,
          bestScore: bestPreparedTestScore(attempts, testId),
          attemptsUsed: attemptsForTest(attempts, testId).length,
          attemptsRemaining: remaining,
          nextTest: nextTemplate ? { id: nextTemplate.id, title: nextTemplate.title } : null,
          draft: draft
            ? {
                answers: draft.answers,
                currentQuestion: draft.currentQuestion,
                startedAt: draft.startedAt,
                updatedAt: draft.updatedAt,
              }
            : null,
          latestAttempt: latest
            ? {
                score: latest.score,
                correctAnswers: latest.correctAnswers,
                totalQuestions: latest.totalQuestions,
                passed: latest.passed,
                attemptNumber: latest.attemptNumber,
                createdAt: latest.createdAt,
                review: buildPreparedTestReview(template.questions, latestAnswers),
              }
            : null,
        },
      };
    },
  );

  app.put(
    "/tests/:testId/draft",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const { testId } = testIdSchema.parse(request.params);
      const body = draftSchema.parse(request.body);
      const template = getTemplate(testId);
      const studentId = request.user!.id;
      const attempts = await listAttempts(studentId);
      assertTestAccess(testId, attempts);
      validateDraftOrThrow(template.questions, body.answers, body.currentQuestion);

      const draft = await prisma.preparedTestDraft.upsert({
        where: { studentId_testId: { studentId, testId } },
        create: {
          studentId,
          testId,
          answers: body.answers,
          currentQuestion: body.currentQuestion,
        },
        update: {
          answers: body.answers,
          currentQuestion: body.currentQuestion,
        },
      });

      return {
        data: {
          saved: true,
          updatedAt: draft.updatedAt,
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
      const index = assertTestAccess(testId, attempts);
      const wasAlreadyPassed = hasPassedPreparedTest(attempts, testId);
      const testAttempts = attemptsForTest(attempts, testId);

      validateDraftOrThrow(template.questions, body.answers as HomeworkTestAnswerMap, 0);
      const result = gradeHomeworkTest(template.questions, body.answers as HomeworkTestAnswerMap);
      const passed = result.score >= PREPARED_TEST_PASSING_SCORE;
      const attemptNumber = testAttempts.length + 1;
      const draft = await prisma.preparedTestDraft.findUnique({
        where: { studentId_testId: { studentId, testId } },
      });
      const durationSeconds = draft
        ? Math.max(0, Math.floor((Date.now() - draft.startedAt.getTime()) / 1000))
        : null;

      const [attempt] = await prisma.$transaction([
        prisma.preparedTestAttempt.create({
          data: {
            testId,
            studentId,
            attemptNumber,
            score: result.score,
            correctAnswers: result.correctAnswers,
            totalQuestions: result.totalQuestions,
            passed,
            answers: body.answers,
            durationSeconds,
          },
        }),
        prisma.preparedTestDraft.deleteMany({ where: { studentId, testId } }),
      ]);

      let xpResult: Awaited<ReturnType<typeof awardPreparedTestXp>> | null = null;
      if (passed) {
        xpResult = await awardPreparedTestXp({
          studentId,
          testId,
          attemptNumber,
          testTitle: template.title,
          eventAt: attempt.createdAt,
        });
        await evaluateAchievements(studentId);
      }
      const remaining = null;
      const nextTest = passed || wasAlreadyPassed
        ? listPreparedTestTemplates()[index + 1] ?? null
        : null;
      return reply.status(201).send({
        data: {
          id: attempt.id,
          testId,
          attemptNumber,
          score: result.score,
          correctAnswers: result.correctAnswers,
          totalQuestions: result.totalQuestions,
          passed,
          passingScore: PREPARED_TEST_PASSING_SCORE,
          attemptsRemaining: remaining,
          xpAwarded: xpResult?.awarded ? xpResult.amount : 0,
          xpStatus: xpResult?.status ?? "not_passed",
          review: buildPreparedTestReview(
            template.questions,
            body.answers as HomeworkTestAnswerMap,
          ),
          topicsToRepeat: passed ? [] : [template.description],
          nextTest: nextTest ? { id: nextTest.id, title: nextTest.title } : null,
          createdAt: attempt.createdAt,
        },
      });
    },
  );

  app.get(
    "/admin/tests/analytics",
    { preHandler: [authenticate, requireContentAdmin] },
    async () => {
      const [attempts, drafts] = await Promise.all([
        prisma.preparedTestAttempt.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.preparedTestDraft.findMany(),
      ]);
      const templates = listPreparedTestTemplates();
      const startedStudentTests = new Set([
        ...attempts.map((attempt) => `${attempt.studentId}:${attempt.testId}`),
        ...drafts.map((draft) => `${draft.studentId}:${draft.testId}`),
      ]);
      const uniqueStudents = new Set([
        ...attempts.map((attempt) => attempt.studentId),
        ...drafts.map((draft) => draft.studentId),
      ]);
      const passedStudentTests = new Set(
        attempts.filter((attempt) => attempt.passed).map((attempt) => `${attempt.studentId}:${attempt.testId}`),
      );

      const tests = templates.map((template, index) => {
        const testAttempts = attempts.filter((attempt) => attempt.testId === template.id);
        const testDrafts = drafts.filter((draft) => draft.testId === template.id);
        const startedStudents = new Set([
          ...testAttempts.map((attempt) => attempt.studentId),
          ...testDrafts.map((draft) => draft.studentId),
        ]);
        const passedStudents = new Set(
          testAttempts.filter((attempt) => attempt.passed).map((attempt) => attempt.studentId),
        );
        const questionStats = template.questions.map((question) => {
          const answered = testAttempts.filter((attempt) => {
            const answers = attempt.answers as HomeworkTestAnswerMap;
            return Boolean(answers[question.id]);
          });
          const incorrect = answered.filter((attempt) => {
            const answers = attempt.answers as HomeworkTestAnswerMap;
            return answers[question.id] !== question.correctOptionId;
          }).length;
          return {
            questionId: question.id,
            prompt: question.prompt,
            answeredCount: answered.length,
            incorrectCount: incorrect,
            incorrectRate: answered.length ? Math.round((incorrect / answered.length) * 100) : 0,
          };
        });
        return {
          id: template.id,
          order: index + 1,
          title: template.title,
          description: template.description,
          questionCount: template.questions.length,
          startedStudents: startedStudents.size,
          passedStudents: passedStudents.size,
          attemptCount: testAttempts.length,
          averageScore: testAttempts.length
            ? Math.round(testAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / testAttempts.length)
            : null,
          passRate: startedStudents.size ? Math.round((passedStudents.size / startedStudents.size) * 100) : 0,
          questionStats,
        };
      });

      return {
        data: {
          summary: {
            totalTests: templates.length,
            uniqueStudents: uniqueStudents.size,
            startedStudentTests: startedStudentTests.size,
            completedStudentTests: passedStudentTests.size,
            attemptCount: attempts.length,
            averageScore: attempts.length
              ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
              : null,
          },
          tests,
        },
      };
    },
  );

  app.get(
    "/admin/tests/:testId/preview",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const { testId } = testIdSchema.parse(request.params);
      const template = getTemplate(testId);
      const order = listPreparedTestTemplates().findIndex((item) => item.id === testId) + 1;
      return {
        data: {
          id: template.id,
          title: template.title,
          description: template.description,
          order,
          totalTests: listPreparedTestTemplates().length,
          passingScore: PREPARED_TEST_PASSING_SCORE,
          maxAttempts: PREPARED_TEST_MAX_ATTEMPTS,
          xpRules: {
            firstAttempt: WEEKLY_PREPARED_TEST_FIRST_ATTEMPT_XP,
            retry: WEEKLY_PREPARED_TEST_RETRY_XP,
            weeklyLimit: WEEKLY_PREPARED_TEST_LIMIT,
          },
          questions: template.questions,
        },
      };
    },
  );
}
