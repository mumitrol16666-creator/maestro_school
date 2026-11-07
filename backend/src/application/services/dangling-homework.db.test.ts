import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { listDanglingHomework } from "./dangling-homework.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("dangling homework: every reason is found, homework of the current sector is not listed", async (t) => {
  const s = randomUUID().slice(0, 8);
  const crmStudentId = `dangling-${s}`;
  const direction = await prisma.direction.create({ data: { slug: `dangling-${s}`, title: `Гитара ${s}`, crmDirectionId: `dangling-${s}` } });
  const topic = (title: string, archived = false) => prisma.learningTopic.create({
    data: { directionId: direction.id, crmStudentId, title, progressPercent: 20, archivedAt: archived ? new Date() : null },
  });
  const [closedTopic, waitingTopic, currentTopic, movedTopic, looseTopic, removedTopic] = await Promise.all([
    topic("Закрытый сектор"), topic("Ждёт экзамена"), topic("Текущий сектор"), topic("Убрана"), topic("Вне сектора"), topic("Удалена", true),
  ]);
  const sector = async (sequence: number, status: "active" | "awaiting_exam" | "closed", topics: Array<{ id: string; state?: "active" | "transferred" }>) => {
    const plan = await prisma.learningPlan.create({
      data: { directionId: direction.id, crmStudentId, month: "2026-11", sequence, status, currentVersionNumber: 1, publishedVersionNumber: 1 },
    });
    const version = await prisma.learningPlanVersion.create({ data: { planId: plan.id, version: 1, publishedAt: new Date() } });
    for (const [index, item] of topics.entries()) {
      await prisma.learningPlanTopic.create({
        data: { planVersionId: version.id, topicId: item.id, state: item.state ?? "active", sortOrder: index, titleSnapshot: "т", masteryCriteriaSnapshot: "" },
      });
    }
    return plan;
  };
  await sector(1, "closed", [{ id: closedTopic.id }]);
  await sector(2, "awaiting_exam", [{ id: waitingTopic.id }, { id: movedTopic.id, state: "transferred" }]);
  await sector(3, "active", [{ id: currentTopic.id }]);
  const homework = async (topicId: string) => {
    const assignment = await prisma.learningHomeworkAssignment.create({
      data: { topicId, instructions: `ДЗ ${topicId.slice(0, 4)}`, idempotencyKey: `dangling-${randomUUID()}` },
    });
    await prisma.learningHomeworkRecipient.create({ data: { assignmentId: assignment.id, crmStudentId } });
  };
  for (const item of [closedTopic, waitingTopic, currentTopic, movedTopic, looseTopic, removedTopic]) await homework(item.id);
  t.after(async () => {
    await prisma.learningHomeworkRecipient.deleteMany({ where: { crmStudentId } });
    await prisma.learningHomeworkAssignment.deleteMany({ where: { topic: { directionId: direction.id } } });
    await prisma.learningPlanTopic.deleteMany({ where: { topic: { directionId: direction.id } } });
    await prisma.learningPlanVersion.deleteMany({ where: { plan: { directionId: direction.id } } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });

  const rows = (await listDanglingHomework()).filter((row) => row.crmStudentId === crmStudentId);
  const reasonOf = new Map(rows.map((row) => [row.topicTitle, row.reason]));
  assert.equal(reasonOf.get("Закрытый сектор"), "sector_closed");
  assert.equal(reasonOf.get("Ждёт экзамена"), "older_open_sector");
  assert.equal(reasonOf.get("Убрана"), "topic_moved");
  assert.equal(reasonOf.get("Вне сектора"), "no_sector");
  assert.equal(reasonOf.get("Удалена"), "topic_removed");
  assert.equal(reasonOf.has("Текущий сектор"), false, "homework of the sector on the lesson is not dangling");
  assert.equal(rows.find((row) => row.topicTitle === "Закрытый сектор")?.sector, 1);
});
