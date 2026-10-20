import { prisma } from "../../infrastructure/database/prisma.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { getProductLevel } from "../../domain/product-economy-v2.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";

/**
 * Plan 3.3: what the child achieved this month, as a parent reads it: topics mastered, sectors
 * closed or passed, and the LEVEL — with whether it was reached this month. Weekly streak
 * milestones are not shown to parents. Everything here only reads.
 */

const MAX_TOPICS = 20;

function monthStart(now: Date) {
  return new Date(`${aqtobeMonthKey(now)}-01T00:00:00+05:00`);
}

async function masteredTopics(student: { id: string; crmStudentId: string | null }, since: Date) {
  const own = student.crmStudentId
    ? await prisma.learningTopic.findMany({
        where: { crmStudentId: student.crmStudentId, masteredAt: { gte: since }, archivedAt: null },
        select: { id: true, title: true, masteredAt: true, direction: { select: { title: true } } },
        orderBy: { masteredAt: "desc" },
        take: MAX_TOPICS,
      })
    : [];
  // A group topic is the group's; the child's own mastery of it is the 100 Points they were paid.
  const groupRewards = await prisma.pointsTransaction.findMany({
    where: { studentId: student.id, sourceKey: { startsWith: "learning-topic-mastery:" }, createdAt: { gte: since } },
    select: { sourceKey: true, createdAt: true },
  });
  const rewardAt = new Map(groupRewards.map((row) => [row.sourceKey!.split(":")[1]!, row.createdAt]));
  const group = rewardAt.size
    ? await prisma.learningTopic.findMany({
        where: { id: { in: [...rewardAt.keys()] }, crmGroupId: { not: null }, archivedAt: null },
        select: { id: true, title: true, direction: { select: { title: true } } },
      })
    : [];
  return [
    ...own.map((topic) => ({ id: topic.id, title: topic.title, direction: topic.direction.title, group: false, masteredAt: topic.masteredAt! })),
    ...group.map((topic) => ({ id: topic.id, title: topic.title, direction: topic.direction.title, group: true, masteredAt: rewardAt.get(topic.id)! })),
  ]
    .sort((left, right) => right.masteredAt.getTime() - left.masteredAt.getTime())
    .slice(0, MAX_TOPICS);
}

async function sectorResults(crmStudentId: string | null, since: Date) {
  if (!crmStudentId) return [];
  const [own, passes] = await Promise.all([
    prisma.learningPlan.findMany({
      where: { crmStudentId, crmGroupId: null, status: "closed", closedAt: { gte: since } },
      select: {
        id: true, sequence: true, closedAt: true, closeReason: true,
        direction: { select: { title: true } },
        exams: { where: { certificateNumber: { not: null } }, select: { certificateNumber: true } },
      },
    }),
    prisma.sectorMemberPass.findMany({
      where: { crmStudentId, passedAt: { gte: since } },
      select: {
        method: true, passedAt: true,
        plan: { select: { id: true, sequence: true, direction: { select: { title: true } } } },
        exam: { select: { certificateNumber: true } },
      },
    }),
  ]);
  return [
    ...own.map((plan) => ({
      planId: plan.id,
      scope: "student" as const,
      sequence: plan.sequence,
      direction: plan.direction.title,
      at: plan.closedAt!,
      how: plan.closeReason === "exam" ? "exam" as const : plan.closeReason === "manual" ? "teacher" as const : "completed" as const,
      certificate: plan.exams[0]?.certificateNumber ?? null,
    })),
    ...passes.map((pass) => ({
      planId: pass.plan.id,
      scope: "group" as const,
      sequence: pass.plan.sequence,
      direction: pass.plan.direction.title,
      at: pass.passedAt,
      how: pass.method === "exam" ? "exam" as const : "teacher" as const,
      certificate: pass.exam?.certificateNumber ?? null,
    })),
  ].sort((left, right) => right.at.getTime() - left.at.getTime());
}

/** The LEVEL now and at the start of the month, from the current epoch's ledger. */
async function levelResult(studentId: string, since: Date, now: Date) {
  if (!rewardEconomyV2AppliesToEvent(now)) return null;
  const epoch = await prisma.economicEpoch.findFirst({
    where: { status: "active", startsAt: { lte: now } },
    orderBy: { startsAt: "desc" },
  });
  if (!epoch) return null;
  const participant = await prisma.economicEpochParticipant.findUnique({
    where: { epochId_studentId: { epochId: epoch.id, studentId } },
    select: { openingPoints: true },
  });
  if (!participant) return null;
  const [all, before] = await Promise.all([
    prisma.pointsTransaction.aggregate({ where: { studentId, economicEpochId: epoch.id }, _sum: { amount: true } }),
    epoch.startsAt < since
      ? prisma.pointsTransaction.aggregate({ where: { studentId, economicEpochId: epoch.id, createdAt: { lt: since } }, _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: 0 } }),
  ]);
  const current = getProductLevel(participant.openingPoints + (all._sum.amount ?? 0));
  const atStart = getProductLevel(participant.openingPoints + (before._sum.amount ?? 0));
  return {
    title: current.level.title,
    level: current.level.level,
    nextTitle: current.next?.title ?? null,
    progressPercent: current.progressPercent,
    reachedThisMonth: current.level.level > atStart.level.level,
  };
}

export async function getFamilyChildResults(studentUserId: string, now = new Date()) {
  const student = await prisma.user.findUnique({ where: { id: studentUserId }, select: { id: true, crmStudentId: true } });
  if (!student) return null;
  const since = monthStart(now);
  const [topics, sectors, level] = await Promise.all([
    masteredTopics(student, since),
    sectorResults(student.crmStudentId, since),
    levelResult(student.id, since, now).catch(() => null),
  ]);
  return { month: aqtobeMonthKey(now), topics, sectors, level };
}
