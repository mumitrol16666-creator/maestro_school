import { prisma } from "../../infrastructure/database/prisma.js";

/**
 * 07.11 (Vladislav: «какие висячие ДЗ? список бы мне»): open homework of a pupil that no lesson
 * shows for checking. The lesson takes homework only on active topics of the newest open sector of
 * its direction, while the pupil sees every open homework; anything else hangs. Each row says why.
 */
export type DanglingHomeworkReason =
  | "sector_closed"
  | "older_open_sector"
  | "topic_moved"
  | "no_sector"
  | "topic_removed";

export const DANGLING_REASON_TEXT: Record<DanglingHomeworkReason, string> = {
  sector_closed: "Сектор закрыт, урок это ДЗ больше не показывает",
  older_open_sector: "Сектор ждёт экзамена, на уроке открыт следующий сектор",
  topic_moved: "Тему убрали или заменили в секторе",
  no_sector: "Тема не входит ни в один опубликованный сектор",
  topic_removed: "Тема удалена",
};

const OPEN_STATES = ["assigned", "waiting_review", "revision"] as const;
const OPEN_SECTOR = new Set(["active", "awaiting_exam"]);

type PlanRef = {
  id: string;
  directionId: string;
  crmStudentId: string | null;
  crmGroupId: string | null;
  sequence: number;
  status: string;
  publishedVersionNumber: number | null;
};

function ownerKey(plan: Pick<PlanRef, "directionId" | "crmStudentId" | "crmGroupId">) {
  return `${plan.directionId}:${plan.crmStudentId ?? ""}:${plan.crmGroupId ?? ""}`;
}

export async function listDanglingHomework(limit = 500) {
  const recipients = await prisma.learningHomeworkRecipient.findMany({
    where: { state: { in: [...OPEN_STATES] }, assignment: { archivedAt: null } },
    include: { assignment: { include: { topic: { include: { direction: { select: { title: true } } } } } } },
    orderBy: { assignment: { assignedAt: "asc" } },
    take: limit,
  });
  if (!recipients.length) return [];

  const topicIds = [...new Set(recipients.map((recipient) => recipient.assignment.topicId))];
  const links = await prisma.learningPlanTopic.findMany({
    where: { topicId: { in: topicIds } },
    select: {
      topicId: true,
      state: true,
      planVersion: {
        select: {
          version: true,
          plan: {
            select: {
              id: true, directionId: true, crmStudentId: true, crmGroupId: true,
              sequence: true, status: true, publishedVersionNumber: true,
            },
          },
        },
      },
    },
  });
  // Only the published version of a sector counts; drafts are not on any lesson.
  const published = links.filter((link) => link.planVersion.plan.publishedVersionNumber === link.planVersion.version);

  const owners = new Set(published.map((link) => ownerKey(link.planVersion.plan)));
  const openPlans = owners.size
    ? await prisma.learningPlan.findMany({
        where: { status: { in: ["active", "awaiting_exam"] }, publishedVersionNumber: { not: null } },
        select: { id: true, directionId: true, crmStudentId: true, crmGroupId: true, sequence: true, status: true, publishedVersionNumber: true },
      })
    : [];
  const newestOpen = new Map<string, PlanRef>();
  for (const plan of openPlans) {
    const key = ownerKey(plan);
    if (!owners.has(key)) continue;
    const current = newestOpen.get(key);
    if (!current || plan.sequence > current.sequence) newestOpen.set(key, plan);
  }

  const studentIds = [...new Set(recipients.map((recipient) => recipient.crmStudentId))];
  const students = await prisma.user.findMany({
    where: { crmStudentId: { in: studentIds }, deletedAt: null },
    select: { id: true, crmStudentId: true, firstName: true, lastName: true },
  });
  const nameByStudent = new Map(students.map((student) => [
    student.crmStudentId,
    [student.lastName, student.firstName].filter(Boolean).join(" "),
  ]));
  const userByStudent = new Map(students.map((student) => [student.crmStudentId, student.id]));

  const rows = [];
  for (const recipient of recipients) {
    const topic = recipient.assignment.topic;
    const topicLinks = published.filter((link) => link.topicId === topic.id);
    let reason: DanglingHomeworkReason | null = null;
    let sector: number | null = null;
    if (topic.archivedAt) {
      reason = "topic_removed";
    } else if (!topicLinks.length) {
      reason = "no_sector";
    } else {
      const activeOpen = topicLinks.filter((link) => link.state === "active" && OPEN_SECTOR.has(link.planVersion.plan.status));
      if (activeOpen.some((link) => newestOpen.get(ownerKey(link.planVersion.plan))?.id === link.planVersion.plan.id)) {
        continue; // on the lesson: not dangling
      }
      if (activeOpen.length) {
        reason = "older_open_sector";
        sector = activeOpen[0].planVersion.plan.sequence;
      } else if (topicLinks.some((link) => link.state === "active")) {
        reason = "sector_closed";
        sector = Math.max(...topicLinks.filter((link) => link.state === "active").map((link) => link.planVersion.plan.sequence));
      } else {
        reason = "topic_moved";
        sector = topicLinks[0].planVersion.plan.sequence;
      }
    }
    rows.push({
      recipientId: recipient.id,
      crmStudentId: recipient.crmStudentId,
      studentName: nameByStudent.get(recipient.crmStudentId) || recipient.crmStudentId,
      studentUserId: recipient.studentUserId ?? userByStudent.get(recipient.crmStudentId) ?? null,
      directionTitle: topic.direction.title,
      topicTitle: topic.title,
      sector,
      instructions: recipient.assignment.instructions.slice(0, 200),
      state: recipient.state,
      assignedAt: recipient.assignment.assignedAt,
      reason,
      reasonText: DANGLING_REASON_TEXT[reason],
    });
  }
  return rows;
}
