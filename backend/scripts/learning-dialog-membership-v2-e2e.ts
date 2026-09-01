import assert from "node:assert/strict";
import { productFeatureConfig } from "../src/config/product-features.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { applyLearningDialogMembershipProjection } from "../src/application/services/learning-dialog-membership.service.js";

const NAMESPACE = "e2e:dialogs";
const TEACHER_1 = "10000000-0000-4000-8000-000000000011";
const TEACHER_2 = "10000000-0000-4000-8000-000000000012";
const STUDENT_1 = "10000000-0000-4000-8000-000000000021";
const STUDENT_2 = "10000000-0000-4000-8000-000000000022";
const PARENT_1 = "10000000-0000-4000-8000-000000000031";
const PARENT_2 = "10000000-0000-4000-8000-000000000032";

function assertLocalQa() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(process.env.MAESTRO_QA_LOCAL, "true");
  assert.ok(["postgres", "127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(productFeatureConfig.flags.learningDialogsV2, true);
}

async function cleanup() {
  await prisma.learningConversation.deleteMany({
    where: { sourceKey: { startsWith: `${NAMESPACE}:` } },
  });
}

async function main() {
  assertLocalQa();
  await cleanup();
  const base = {
    namespace: NAMESPACE,
    teacherUserId: TEACHER_1,
    assignments: [{
      studentUserId: STUDENT_1,
      teacherUserId: TEACHER_1,
      crmDirectionId: "qa-direction-guitar",
      directionTitle: "Гитара",
      parentUserIds: [PARENT_1, PARENT_2],
    }],
    groups: [{
      crmGroupId: "qa-group-band",
      title: "QA Ансамбль",
      crmDirectionId: "qa-direction-guitar",
      teacherUserId: TEACHER_1,
      studentUserIds: [STUDENT_1, STUDENT_2],
    }],
  };

  await applyLearningDialogMembershipProjection({
    ...base,
    syncedAt: new Date("2026-08-29T09:00:00.000Z"),
  });
  await applyLearningDialogMembershipProjection({
    ...base,
    syncedAt: new Date("2026-08-29T09:00:00.000Z"),
  });
  await Promise.all([
    applyLearningDialogMembershipProjection({
      ...base,
      syncedAt: new Date("2026-08-29T09:01:00.000Z"),
    }),
    applyLearningDialogMembershipProjection({
      ...base,
      syncedAt: new Date("2026-08-29T09:01:00.000Z"),
    }),
  ]);
  assert.equal(await prisma.learningConversation.count({
    where: { sourceKey: { startsWith: `${NAMESPACE}:` } },
  }), 3);
  assert.equal(await prisma.learningConversationMember.count({
    where: { conversation: { sourceKey: { startsWith: `${NAMESPACE}:` } } },
  }), 8);
  assert.equal(await prisma.learningConversationMembershipEvent.count({
    where: { conversation: { sourceKey: { startsWith: `${NAMESPACE}:` } } },
  }), 8);

  await applyLearningDialogMembershipProjection({
    ...base,
    syncedAt: new Date("2026-08-29T10:00:00.000Z"),
    assignments: [],
    groups: [{ ...base.groups[0], studentUserIds: [STUDENT_1] }],
  });
  const archived = await prisma.learningConversation.findFirstOrThrow({
    where: { type: "learning_direction", sourceKey: { startsWith: `${NAMESPACE}:` } },
  });
  assert.equal(archived.status, "read_only");
  assert.ok(archived.textRetentionUntil);
  const archivedParentDialog = await prisma.learningConversation.findFirstOrThrow({
    where: { type: "parent_teacher", sourceKey: { startsWith: `${NAMESPACE}:` } },
  });
  assert.equal(archivedParentDialog.status, "read_only");
  const removedStudent = await prisma.learningConversationMember.findFirstOrThrow({
    where: {
      userId: STUDENT_2,
      conversation: { type: "crm_group", sourceKey: { startsWith: `${NAMESPACE}:` } },
    },
  });
  assert.ok(removedStudent.leftAt);
  const groupTeacherEvents = await prisma.learningConversationMembershipEvent.findMany({
    where: {
      userId: TEACHER_1,
      conversation: { type: "crm_group", sourceKey: { startsWith: `${NAMESPACE}:` } },
    },
    orderBy: { occurredAt: "asc" },
    select: { event: true },
  });
  assert.deepEqual(groupTeacherEvents.map((item) => item.event), ["joined"],
    "a teacher still assigned to the group does not receive a false leave/write-disabled event");

  await applyLearningDialogMembershipProjection({
    ...base,
    syncedAt: new Date("2026-08-29T11:00:00.000Z"),
    groups: [{ ...base.groups[0], studentUserIds: [STUDENT_1] }],
  });
  assert.equal(await prisma.learningConversation.count({
    where: { type: "learning_direction", sourceKey: { startsWith: `${NAMESPACE}:` } },
  }), 1);
  assert.equal(await prisma.learningConversation.count({
    where: { type: "learning_direction", status: "active", sourceKey: { startsWith: `${NAMESPACE}:` } },
  }), 1);
  const resumedLearning = await prisma.learningConversation.findFirstOrThrow({
    where: { type: "learning_direction", status: "active", sourceKey: { startsWith: `${NAMESPACE}:` } },
  });
  assert.equal(resumedLearning.id, archived.id, "the same teacher resumes the existing conversation");
  const resumedParentDialog = await prisma.learningConversation.findFirstOrThrow({
    where: { type: "parent_teacher", status: "active", sourceKey: { startsWith: `${NAMESPACE}:` } },
    include: { members: { where: { leftAt: null } } },
  });
  assert.equal(resumedParentDialog.id, archivedParentDialog.id);
  assert.deepEqual(
    new Set(resumedParentDialog.members.filter((member) => member.role === "parent").map((member) => member.userId)),
    new Set([PARENT_1, PARENT_2]),
  );
  assert.equal(await prisma.learningConversationMember.count({
    where: {
      userId: TEACHER_2,
      conversation: { sourceKey: { startsWith: `${NAMESPACE}:` } },
    },
  }), 0, "a one-off substitute is not projected into dialog membership");

  await applyLearningDialogMembershipProjection({
    ...base,
    syncedAt: new Date("2026-08-29T12:00:00.000Z"),
    groups: [],
  });
  const archivedGroup = await prisma.learningConversation.findFirstOrThrow({
    where: { type: "crm_group", sourceKey: { startsWith: `${NAMESPACE}:` } },
  });
  assert.equal(archivedGroup.status, "read_only");
  const archivedGroupTeacherEvents = await prisma.learningConversationMembershipEvent.findMany({
    where: {
      userId: TEACHER_1,
      conversation: { type: "crm_group", sourceKey: { startsWith: `${NAMESPACE}:` } },
    },
    orderBy: { occurredAt: "asc" },
    select: { event: true },
  });
  assert.deepEqual(archivedGroupTeacherEvents.map((item) => item.event), ["joined", "left"],
    "archiving a missing group does not add a false write-disabled event after teacher leave");

  await cleanup();
  assert.equal(await prisma.learningConversation.count({
    where: { sourceKey: { startsWith: `${NAMESPACE}:` } },
  }), 0);
  console.log("Learning dialog membership V2 E2E passed");
}

main().finally(() => prisma.$disconnect());
