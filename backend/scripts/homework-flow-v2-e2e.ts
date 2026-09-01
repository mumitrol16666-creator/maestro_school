import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { UserNotificationType } from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";
import {
  getAqtobeWeekRange,
  WEEKLY_HOMEWORK_DIRECTION_LIMIT,
} from "../src/application/services/weekly-league-policy.js";

const API_URL = process.env.HOMEWORK_E2E_API_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "QaMaestro2026!";
const PREFIX = "e2e:homework-v2:";

type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };

async function request<T>(
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
) {
  const response = await fetch(`${API_URL}${path}`, options);
  const body = await response.json() as ApiEnvelope<T>;
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`,
  );
  return body.data as T;
}

async function login(phone: string, profile: "student" | "staff") {
  const data = await request<{ token: string }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: PASSWORD, profile }),
  });
  return data.token;
}

function auth(token: string, body?: unknown): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function cleanup() {
  const assignments = await prisma.learningHomeworkAssignment.findMany({
    where: { idempotencyKey: { startsWith: PREFIX } },
    select: { id: true, recipients: { select: { id: true } } },
  });
  const recipientIds = assignments.flatMap((assignment) => (
    assignment.recipients.map((recipient) => recipient.id)
  ));
  if (recipientIds.length) {
    await prisma.userNotification.deleteMany({
      where: {
        OR: [
          ...recipientIds.map((recipientId) => ({ dedupeKey: { contains: recipientId } })),
          ...assignments.map((assignment) => ({ dedupeKey: { contains: assignment.id } })),
        ],
      },
    });
  }
  await Promise.all(assignments.map((assignment) => rm(
    path.resolve(
      process.env.UPLOAD_DIR ?? "uploads",
      "private",
      "learning-homework",
      assignment.id,
    ),
    { recursive: true, force: true },
  )));
  await prisma.learningHomeworkAssignment.deleteMany({
    where: { idempotencyKey: { startsWith: PREFIX } },
  });
}

async function main() {
  assertLocalE2eDatabase();

  await cleanup();
  const [teacherToken, otherTeacherToken, adminToken, student1Token, student2Token] = await Promise.all([
    login("qa_teacher_1", "staff"),
    login("qa_teacher_2", "staff"),
    login("qa_admin", "staff"),
    login("qa_student_1", "student"),
    login("qa_student_2", "student"),
  ]);
  const [studentTopic, groupTopic, studentUser, teacherUser, otherTeacherUser, adminUser] = await Promise.all([
    prisma.learningTopic.findFirst({
      where: { crmStudentId: "QA-STUDENT-1", archivedAt: null, progressPercent: { lt: 100 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.learningTopic.findFirst({
      where: { crmGroupId: "QA-GROUP-1", archivedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findUnique({ where: { crmStudentId: "QA-STUDENT-1" } }),
    prisma.user.findUnique({ where: { login: "qa_teacher_1" } }),
    prisma.user.findUnique({ where: { login: "qa_teacher_2" } }),
    prisma.user.findUnique({ where: { login: "qa_admin" } }),
  ]);
  assert(studentTopic, "QA individual V2 topic is missing");
  assert(groupTopic, "QA group V2 topic is missing");
  assert(studentUser, "QA student app account is missing");
  assert(teacherUser, "QA teacher app account is missing");
  assert(otherTeacherUser, "QA foreign teacher app account is missing");
  assert(adminUser, "QA admin app account is missing");

  const rewardWeek = getAqtobeWeekRange();
  const [rewardsBefore, eligibleHomeworkXpBefore] = await Promise.all([
    Promise.all([
      prisma.pointsTransaction.count({ where: { studentId: studentUser.id } }),
      prisma.leagueXpEvent.count({ where: { studentId: studentUser.id } }),
      prisma.maestroCoinTransaction.count({ where: { studentId: studentUser.id } }),
    ]),
    prisma.leagueXpEvent.count({
      where: {
        studentId: studentUser.id,
        directionId: studentTopic.directionId,
        sourceType: { in: ["learning_homework", "course_homework", "online_assignment"] },
        createdAt: { gte: rewardWeek.start, lt: rewardWeek.end },
      },
    }),
  ]);
  const topicProgressBefore = studentTopic.progressPercent;

  try {
    const assignmentKey = `${PREFIX}individual`;
    const created = await request<{
      id: string;
      recipientCount: number;
      recipients: Array<{ id: string; crmStudentId: string }>;
      idempotent: boolean;
    }>("/teachers/me/homework-assignments", {
      ...auth(teacherToken, {
        topicId: studentTopic.id,
        instructions: "E2E: ровно сыграть переходы под метроном",
        idempotencyKey: assignmentKey,
      }),
      method: "POST",
    }, 201);
    assert.equal(created.recipientCount, 1);
    assert.equal(created.recipients[0].crmStudentId, "QA-STUDENT-1");
    assert.equal(await prisma.userNotification.count({
      where: {
        userId: studentUser.id,
        type: "homework_assigned" as UserNotificationType,
        dedupeKey: `learning-hw:assigned:${created.id}:${studentUser.id}`,
      },
    }), 1, "A new assignment must notify the student once");

    const teacherAssignments = await request<{
      model: string;
      assignments: Array<{
        id: string;
        instructions: string;
        recipientCount: number;
      }>;
    }>(
      `/teachers/me/learning-topics/${studentTopic.id}/homework-assignments`,
      auth(teacherToken),
    );
    assert.equal(teacherAssignments.model, "learning_homework_v2");
    assert.equal(teacherAssignments.assignments[0].id, created.id);
    assert.equal(
      teacherAssignments.assignments[0].instructions,
      "E2E: ровно сыграть переходы под метроном",
    );
    assert.equal(teacherAssignments.assignments[0].recipientCount, 1);
    await request(
      `/teachers/me/learning-topics/${studentTopic.id}/homework-assignments`,
      auth(otherTeacherToken),
      403,
    );

    const replay = await request<{ id: string; idempotent: boolean }>(
      "/teachers/me/homework-assignments",
      {
        ...auth(teacherToken, {
          topicId: studentTopic.id,
          instructions: "E2E: ровно сыграть переходы под метроном",
          idempotencyKey: assignmentKey,
        }),
        method: "POST",
      },
    );
    assert.equal(replay.id, created.id);
    assert.equal(replay.idempotent, true);
    assert.equal(await prisma.userNotification.count({
      where: {
        userId: studentUser.id,
        type: "homework_assigned" as UserNotificationType,
        dedupeKey: `learning-hw:assigned:${created.id}:${studentUser.id}`,
      },
    }), 1, "Assignment replay must not duplicate the student notification");
    await request("/teachers/me/homework-assignments", {
      ...auth(teacherToken, {
        topicId: studentTopic.id,
        instructions: "E2E: другое назначение с тем же ключом",
        idempotencyKey: assignmentKey,
      }),
      method: "POST",
    }, 409);

    await request(`/homeworks/${created.id}/submissions`, {
      ...auth(student1Token, {
        submissionMode: "materials",
        idempotencyKey: `${PREFIX}invalid-empty`,
      }),
      method: "POST",
    }, 400);

    const submissionFile = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    ], { type: "image/png" });
    const firstForm = new FormData();
    firstForm.set("submissionMode", "ready_for_lesson");
    firstForm.set("text", "E2E: готов, переход проверить очно");
    firstForm.set("link", "https://example.com/maestro-homework");
    firstForm.append("file", submissionFile, "e2e-homework.png");
    const first = await request<{
      state: string;
      latestAttempt: { id: string; cycleNumber: number; versionInCycle: number };
    }>(`/homeworks/${created.id}/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${student1Token}`,
        "Idempotency-Key": `${PREFIX}attempt-1`,
      },
      body: firstForm,
    }, 201);
    assert.equal(first.state, "waiting_review");
    assert.equal(first.latestAttempt.cycleNumber, 1);

    const [teacherQueue, foreignQueue, adminQueue, teacherDetail] = await Promise.all([
      request<Array<{
        model: string;
        submissionId: string;
        submissionMode: string;
        versionInCycle: number;
      }>>("/admin/homework-submissions?status=submitted&source=learning", auth(teacherToken)),
      request<Array<{ submissionId: string }>>(
        "/admin/homework-submissions?status=submitted&source=learning",
        auth(otherTeacherToken),
      ),
      request<Array<{ submissionId: string }>>(
        "/admin/homework-submissions?status=submitted&source=learning",
        auth(adminToken),
      ),
      request<{
        model: string;
        submissionId: string;
        canReview: boolean;
        attempts: Array<{
          id: string;
          text: string | null;
          materials: Array<{ url: string; privateFile?: boolean; title?: string }>;
        }>;
      }>(`/admin/homework-submissions/${created.recipients[0].id}`, auth(teacherToken)),
    ]);
    const teacherQueueItem = teacherQueue.find((item) => item.submissionId === created.recipients[0].id);
    assert(teacherQueueItem, "Responsible teacher must see the submitted homework");
    assert.equal(teacherQueueItem.model, "learning_homework_v2");
    assert.equal(teacherQueueItem.submissionMode, "ready_for_lesson");
    assert(!foreignQueue.some((item) => item.submissionId === created.recipients[0].id));
    assert(adminQueue.some((item) => item.submissionId === created.recipients[0].id));
    assert.equal(teacherDetail.canReview, true);
    assert.equal(teacherDetail.attempts.length, 1);
    assert.equal(teacherDetail.attempts[0].text, "E2E: готов, переход проверить очно");
    assert.equal(teacherDetail.attempts[0].materials[0].url, "https://example.com/maestro-homework");
    const uploadedMaterial = teacherDetail.attempts[0].materials.find((material) => material.privateFile);
    assert(uploadedMaterial, "The teacher must receive the student's private file metadata");
    assert.equal(uploadedMaterial.title, "e2e-homework.png");
    const downloadUrl = new URL(uploadedMaterial.url, API_URL).toString();
    const teacherDownload = await fetch(downloadUrl, auth(teacherToken));
    assert.equal(teacherDownload.status, 200, "The responsible teacher must download the private file");
    assert.equal((await teacherDownload.arrayBuffer()).byteLength, submissionFile.size);
    const foreignDownload = await fetch(downloadUrl, auth(otherTeacherToken));
    assert.equal(foreignDownload.status, 403, "A foreign teacher must not download the private file");
    await request(
      `/admin/homework-submissions/${created.recipients[0].id}`,
      auth(otherTeacherToken),
      403,
    );

    const submittedNotificationCounts = await Promise.all([
      prisma.userNotification.count({
        where: {
          userId: teacherUser.id,
          dedupeKey: { contains: created.recipients[0].id },
        },
      }),
      prisma.userNotification.count({
        where: {
          userId: adminUser.id,
          dedupeKey: { contains: created.recipients[0].id },
        },
      }),
      prisma.userNotification.count({
        where: {
          userId: otherTeacherUser.id,
          dedupeKey: { contains: created.recipients[0].id },
        },
      }),
    ]);
    assert.deepEqual(submittedNotificationCounts, [1, 1, 0]);

    const replayForm = new FormData();
    replayForm.set("submissionMode", "ready_for_lesson");
    replayForm.set("text", "E2E: готов, переход проверить очно");
    replayForm.set("link", "https://example.com/maestro-homework");
    replayForm.append("file", submissionFile, "e2e-homework.png");
    const replayAttempt = await request<{
      latestAttempt: { id: string };
    }>(`/homeworks/${created.id}/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${student1Token}`,
        "Idempotency-Key": `${PREFIX}attempt-1`,
      },
      body: replayForm,
    });
    assert.equal(replayAttempt.latestAttempt.id, first.latestAttempt.id);
    await request(`/homeworks/${created.id}/submissions`, {
      ...auth(student1Token, {
        submissionMode: "materials",
        text: "E2E: другой ответ с тем же ключом",
        idempotencyKey: `${PREFIX}attempt-1`,
      }),
      method: "POST",
    }, 409);

    const updated = await request<{
      attempts: Array<{ status: string }>;
      latestAttempt: { id: string; cycleNumber: number; versionInCycle: number };
    }>(`/homeworks/${created.id}/submissions`, {
      ...auth(student1Token, {
        submissionMode: "materials",
        text: "E2E: добавлена актуальная версия",
        previousAttemptId: first.latestAttempt.id,
        idempotencyKey: `${PREFIX}attempt-2`,
      }),
      method: "POST",
    }, 201);
    assert.equal(updated.latestAttempt.cycleNumber, 1);
    assert.equal(updated.latestAttempt.versionInCycle, 2);
    assert.equal(updated.attempts[1].status, "superseded");

    const queueAfterUpdate = await request<Array<{
      submissionId: string;
      versionInCycle: number;
    }>>("/admin/homework-submissions?status=submitted&source=learning", auth(teacherToken));
    const matchingRows = queueAfterUpdate.filter((item) => item.submissionId === created.recipients[0].id);
    assert.equal(matchingRows.length, 1, "Updated answer must remain one queue row");
    assert.equal(matchingRows[0].versionInCycle, 2);
    assert.equal(await prisma.userNotification.count({
      where: {
        userId: teacherUser.id,
        dedupeKey: { contains: created.recipients[0].id },
      },
    }), 1, "Updated version in the same cycle must not duplicate the notification");

    await request(`/homework-recipients/${created.recipients[0].id}/reviews`, {
      ...auth(otherTeacherToken, {
        decision: "accepted",
        idempotencyKey: `${PREFIX}foreign-review`,
      }),
      method: "POST",
    }, 403);

    const revision = await request<{ review: { id: string; decision: string; cycleNumber: number } }>(
      `/homework-recipients/${created.recipients[0].id}/reviews`,
      {
        ...auth(teacherToken, {
          decision: "revision",
          comment: "E2E: повторить медленнее",
          idempotencyKey: `${PREFIX}revision`,
        }),
        method: "POST",
      },
      201,
    );
    assert.equal(revision.review.decision, "revision");
    assert.equal(await prisma.userNotification.count({
      where: {
        userId: studentUser.id,
        dedupeKey: { startsWith: `learning-hw:reviewed:${created.recipients[0].id}:${revision.review.id}:` },
      },
    }), 1);
    await request(`/homework-recipients/${created.recipients[0].id}/reviews`, {
      ...auth(teacherToken, {
        decision: "accepted",
        idempotencyKey: `${PREFIX}revision`,
      }),
      method: "POST",
    }, 409);

    const assignments = await request<{
      assignments: Array<{
        id: string;
        state: string;
        currentCycle: number;
        latestAttempt: { id: string; review: { comment: string } };
      }>;
    }>("/students/me/homework-assignments", auth(student1Token));
    const afterRevision = assignments.assignments.find((item) => item.id === created.id);
    assert(afterRevision);
    assert.equal(afterRevision.state, "revision");
    assert.equal(afterRevision.currentCycle, 2);
    assert.equal(afterRevision.latestAttempt.review.comment, "E2E: повторить медленнее");

    const resubmitted = await request<{
      state: string;
      latestAttempt: { cycleNumber: number; versionInCycle: number };
    }>(`/homeworks/${created.id}/submissions`, {
      ...auth(student1Token, {
        submissionMode: "ready_for_lesson",
        previousAttemptId: afterRevision.latestAttempt.id,
        idempotencyKey: `${PREFIX}attempt-3`,
      }),
      method: "POST",
    }, 201);
    assert.equal(resubmitted.state, "waiting_review");
    assert.equal(resubmitted.latestAttempt.cycleNumber, 2);
    assert.equal(resubmitted.latestAttempt.versionInCycle, 1);
    assert.equal(await prisma.userNotification.count({
      where: {
        userId: teacherUser.id,
        dedupeKey: { contains: created.recipients[0].id },
      },
    }), 2, "A new revision cycle must create one new reviewer notification");

    const accepted = await request<{ review: { id: string; decision: string } }>(
      `/homework-recipients/${created.recipients[0].id}/reviews`,
      {
        ...auth(adminToken, {
          decision: "accepted",
          idempotencyKey: `${PREFIX}accepted`,
        }),
        method: "POST",
      },
      201,
    );
    assert.equal(accepted.review.decision, "accepted");
    assert.equal(await prisma.userNotification.count({
      where: {
        userId: studentUser.id,
        dedupeKey: { startsWith: `learning-hw:reviewed:${created.recipients[0].id}:${accepted.review.id}:` },
      },
    }), 1);

    const group = await request<{
      id: string;
      recipientCount: number;
      recipients: Array<{ crmStudentId: string }>;
    }>("/teachers/me/homework-assignments", {
      ...auth(teacherToken, {
        topicId: groupTopic.id,
        instructions: "E2E: общее групповое ДЗ",
        idempotencyKey: `${PREFIX}group`,
      }),
      method: "POST",
    }, 201);
    assert.equal(group.recipientCount, 3);
    assert.deepEqual(
      group.recipients.map((item) => item.crmStudentId).sort(),
      ["QA-STUDENT-1", "QA-STUDENT-2", "QA-STUDENT-3"],
    );
    const student2 = await request<{ assignments: Array<{ id: string }> }>(
      "/students/me/homework-assignments",
      auth(student2Token),
    );
    assert(student2.assignments.some((assignment) => assignment.id === group.id));

    const [rewardsAfter, topicAfter] = await Promise.all([
      Promise.all([
        prisma.pointsTransaction.count({ where: { studentId: studentUser.id } }),
        prisma.leagueXpEvent.count({ where: { studentId: studentUser.id } }),
        prisma.maestroCoinTransaction.count({ where: { studentId: studentUser.id } }),
      ]),
      prisma.learningTopic.findUnique({ where: { id: studentTopic.id } }),
    ]);
    assert.equal(rewardsAfter[0], rewardsBefore[0], "Accepted homework must not award Points");
    const expectedXpDelta = eligibleHomeworkXpBefore < WEEKLY_HOMEWORK_DIRECTION_LIMIT ? 1 : 0;
    assert.equal(
      rewardsAfter[1],
      rewardsBefore[1] + expectedXpDelta,
      "Accepted homework must award XP once unless the weekly direction limit is already reached",
    );
    assert.equal(rewardsAfter[2], rewardsBefore[2], "Accepted homework must not award Coins");
    assert.equal(topicAfter?.progressPercent, topicProgressBefore, "Review must not change topic progress");

    console.log("Homework V2 E2E passed: lifecycle, files, role access, notifications, group recipients and weekly XP policy.");
  } finally {
    await cleanup();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
