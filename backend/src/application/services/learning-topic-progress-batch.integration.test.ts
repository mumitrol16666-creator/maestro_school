import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { updateLearningTopicProgressBatchFromLessonV2 } from "./learning-plan-v2.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1"
  ? test
  : test.skip;

type BatchFixture = Awaited<ReturnType<typeof createBatchFixture>>;

async function createBatchFixture() {
  const suffix = randomUUID();
  const existingRole = await prisma.role.findUnique({ where: { slug: "curator" } });
  const role = existingRole ?? await prisma.role.create({
    data: {
      slug: "curator",
      name: "Куратор",
      description: "Created by the topic batch integration test",
    },
  });
  const actor = await prisma.user.create({
    data: {
      login: `topic-batch-${suffix}`,
      phone: `+7700${suffix.replaceAll("-", "").slice(0, 10)}`,
      passwordHash: "integration-test-only",
      firstName: "Atomic",
      lastName: "Batch",
      roleId: role.id,
    },
  });
  const direction = await prisma.direction.create({
    data: {
      slug: `topic-batch-${suffix}`,
      title: `Topic batch ${suffix}`,
      crmDirectionId: `topic-batch-${suffix}`,
    },
  });
  const firstTopicId = randomUUID();
  const secondTopicId = randomUUID();
  await prisma.learningTopic.createMany({
    data: [
      {
        id: firstTopicId,
        directionId: direction.id,
        crmStudentId: `topic-batch-owner-${suffix}`,
        title: "Первая тема",
        progressPercent: 20,
      },
      {
        id: secondTopicId,
        directionId: direction.id,
        crmStudentId: `topic-batch-owner-${suffix}`,
        title: "Вторая тема",
        progressPercent: 50,
      },
    ],
  });
  return {
    actor,
    direction,
    firstTopicId,
    secondTopicId,
    createdRoleId: existingRole ? null : role.id,
  };
}

async function removeBatchFixture(fixture: BatchFixture) {
  const topicIds = [fixture.firstTopicId, fixture.secondTopicId];
  await prisma.learningTopicProgress.deleteMany({ where: { topicId: { in: topicIds } } });
  await prisma.learningTopic.deleteMany({ where: { id: { in: topicIds } } });
  await prisma.user.delete({ where: { id: fixture.actor.id } });
  await prisma.direction.delete({ where: { id: fixture.direction.id } });
  if (fixture.createdRoleId) {
    await prisma.role.delete({ where: { id: fixture.createdRoleId } });
  }
}

integrationTest(
  "a stale second topic fails preflight without writing, then a valid batch is replay-safe",
  async (t) => {
    const fixture = await createBatchFixture();
    t.after(() => removeBatchFixture(fixture));
    const crmClassId = `topic-batch-class-${randomUUID()}`;

    await assert.rejects(
      updateLearningTopicProgressBatchFromLessonV2(
        fixture.actor.id,
        crmClassId,
        [
          {
            topicId: fixture.firstTopicId,
            expectedPercent: 20,
            toPercent: 40,
          },
          {
            topicId: fixture.secondTopicId,
            expectedPercent: 49,
            toPercent: 60,
          },
        ],
      ),
      (error) => error instanceof AppError && error.code === "LEARNING_TOPIC_STALE_PROGRESS",
    );

    const topics = await prisma.learningTopic.findMany({
      where: { id: { in: [fixture.firstTopicId, fixture.secondTopicId] } },
      select: { id: true, progressPercent: true },
    });
    const progressByTopicId = new Map(topics.map((topic) => [topic.id, topic.progressPercent]));
    assert.equal(progressByTopicId.get(fixture.firstTopicId), 20);
    assert.equal(progressByTopicId.get(fixture.secondTopicId), 50);
    assert.equal(await prisma.learningTopicProgress.count({
      where: { sourceKey: { startsWith: `offline-lesson:${crmClassId}:topic:` } },
    }), 0);

    const validUpdates = [
      {
        topicId: fixture.firstTopicId,
        expectedPercent: 20,
        toPercent: 40,
      },
      {
        topicId: fixture.secondTopicId,
        expectedPercent: 50,
        toPercent: 60,
      },
    ];
    const applied = await updateLearningTopicProgressBatchFromLessonV2(
      fixture.actor.id,
      crmClassId,
      validUpdates,
    );
    assert.deepEqual(applied.map((topic) => topic.progressPercent), [40, 60]);
    assert.deepEqual(applied.map((topic) => topic.idempotent), [false, false]);

    const replayed = await updateLearningTopicProgressBatchFromLessonV2(
      fixture.actor.id,
      crmClassId,
      validUpdates,
    );
    assert.deepEqual(replayed.map((topic) => topic.progressPercent), [40, 60]);
    assert.deepEqual(replayed.map((topic) => topic.idempotent), [true, true]);
    assert.equal(await prisma.learningTopicProgress.count({
      where: { sourceKey: { startsWith: `offline-lesson:${crmClassId}:topic:` } },
    }), 2);
  },
);

type InteractiveTransaction = <Result>(
  operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
) => Promise<Result>;

integrationTest(
  "an injected failure on the second transactional write rolls back the first topic and history row",
  async (t) => {
    const fixture = await createBatchFixture();
    t.after(() => removeBatchFixture(fixture));
    const crmClassId = `topic-batch-rollback-${randomUUID()}`;
    const injectedFailure = new Error("injected failure after the first topic write");
    const mutablePrisma = prisma as unknown as { $transaction: InteractiveTransaction };
    const originalTransaction = mutablePrisma.$transaction;
    let topicUpdateAttempts = 0;
    let progressRowsCreatedInsideTransaction = 0;

    mutablePrisma.$transaction = async (operation) => originalTransaction.call(
      prisma,
      async (transaction) => {
        const learningTopic = new Proxy(transaction.learningTopic, {
          get(target, property, receiver) {
            if (property !== "updateMany") return Reflect.get(target, property, receiver);
            return async (args: Parameters<typeof transaction.learningTopic.updateMany>[0]) => {
              topicUpdateAttempts += 1;
              if (topicUpdateAttempts === 2) {
                assert.equal(progressRowsCreatedInsideTransaction, 1);
                throw injectedFailure;
              }
              return transaction.learningTopic.updateMany(args);
            };
          },
        });
        const learningTopicProgress = new Proxy(transaction.learningTopicProgress, {
          get(target, property, receiver) {
            if (property !== "create") return Reflect.get(target, property, receiver);
            return async (args: Parameters<typeof transaction.learningTopicProgress.create>[0]) => {
              const result = await transaction.learningTopicProgress.create(args);
              progressRowsCreatedInsideTransaction += 1;
              return result;
            };
          },
        });
        const transactionWithInjectedFailure = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "learningTopic") return learningTopic;
            if (property === "learningTopicProgress") return learningTopicProgress;
            return Reflect.get(target, property, receiver);
          },
        });
        return operation(transactionWithInjectedFailure);
      },
    );

    try {
      await assert.rejects(
        updateLearningTopicProgressBatchFromLessonV2(
          fixture.actor.id,
          crmClassId,
          [
            {
              topicId: fixture.firstTopicId,
              expectedPercent: 20,
              toPercent: 40,
            },
            {
              topicId: fixture.secondTopicId,
              expectedPercent: 50,
              toPercent: 60,
            },
          ],
        ),
        (error) => error === injectedFailure,
      );
    } finally {
      mutablePrisma.$transaction = originalTransaction;
    }

    assert.equal(topicUpdateAttempts, 2);
    assert.equal(progressRowsCreatedInsideTransaction, 1);
    const topics = await prisma.learningTopic.findMany({
      where: { id: { in: [fixture.firstTopicId, fixture.secondTopicId] } },
      select: { id: true, progressPercent: true },
    });
    const progressByTopicId = new Map(topics.map((topic) => [topic.id, topic.progressPercent]));
    assert.equal(progressByTopicId.get(fixture.firstTopicId), 20);
    assert.equal(progressByTopicId.get(fixture.secondTopicId), 50);
    assert.equal(await prisma.learningTopicProgress.count({
      where: { sourceKey: { startsWith: `offline-lesson:${crmClassId}:topic:` } },
    }), 0);
  },
);
