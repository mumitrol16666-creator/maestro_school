/**
 * Local-only DEV-01A legacy plan migration.
 *
 * Usage:
 *   npm run topics-v2:migrate -- --mode=dry-run
 *   MAESTRO_QA_LOCAL=true CONFIRM=learning-topics-v2 npm run topics-v2:migrate -- --mode=execute
 *   MAESTRO_QA_LOCAL=true CONFIRM=rollback-learning-topics-v2 npm run topics-v2:migrate -- --mode=rollback
 *
 * Direction mapping is deliberately explicit because legacy plans did not
 * store a stable direction id:
 *   LEARNING_TOPICS_V2_DIRECTION_MAP_JSON='{"student-monthly-plan:<uuid>":"<direction-uuid>"}'
 */
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  buildLearningTopicsV2MigrationPlan,
  type LearningPlanMigrationCandidate,
  type LegacyLearningPlanInput,
} from "../src/domain/learning-topics-v2-migration.js";

type MigrationMode = "dry-run" | "execute" | "rollback";

const prisma = new PrismaClient();

function migrationMode(): MigrationMode {
  const raw = process.argv.find((argument) => argument.startsWith("--mode="))
    ?.slice("--mode=".length) ?? "dry-run";
  if (raw === "dry-run" || raw === "execute" || raw === "rollback") return raw;
  throw new Error("--mode must be dry-run, execute, or rollback");
}

function directionMapFromEnv(): Record<string, string> {
  const raw = process.env.LEARNING_TOPICS_V2_DIRECTION_MAP_JSON?.trim();
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("LEARNING_TOPICS_V2_DIRECTION_MAP_JSON must be a JSON object");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.some(([, value]) => typeof value !== "string")) {
    throw new Error("Every direction mapping value must be a direction UUID string");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function assertLocalMutationAllowed(mode: Exclude<MigrationMode, "dry-run">) {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error(`${mode} requires MAESTRO_QA_LOCAL=true`);
  }

  const expectedConfirmation = mode === "execute"
    ? "learning-topics-v2"
    : "rollback-learning-topics-v2";
  if (process.env.CONFIRM !== expectedConfirmation) {
    throw new Error(`${mode} requires CONFIRM=${expectedConfirmation}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "db",
    "host.docker.internal",
  ]);
  if (!allowedHosts.has(hostname)) {
    throw new Error(`Refusing ${mode} against non-local database host: ${hostname}`);
  }
}

async function loadLegacyPlans(): Promise<LegacyLearningPlanInput[]> {
  const [studentPlans, groupPlans] = await Promise.all([
    prisma.studentMonthlyPlan.findMany({ orderBy: { id: "asc" } }),
    prisma.groupMonthlyPlan.findMany({ orderBy: { id: "asc" } }),
  ]);

  return [
    ...studentPlans.map((plan): LegacyLearningPlanInput => ({
      kind: "student",
      id: plan.id,
      ownerId: plan.crmStudentId,
      teacherUserId: plan.teacherUserId,
      month: plan.month,
      expectedResult: plan.expectedResult,
      skills: plan.skills,
      checkpoint: plan.checkpoint,
      note: plan.note,
      materials: [],
      publishedSnapshot: plan.publishedSnapshot,
      publishedAt: plan.publishedAt,
      draftRevision: plan.draftRevision,
      publishedRevision: plan.publishedRevision,
    })),
    ...groupPlans.map((plan): LegacyLearningPlanInput => ({
      kind: "group",
      id: plan.id,
      ownerId: plan.crmGroupId,
      teacherUserId: plan.teacherUserId,
      month: plan.month,
      expectedResult: plan.expectedResult,
      skills: plan.skills,
      checkpoint: plan.checkpoint,
      note: plan.note,
      materials: plan.materials,
      publishedSnapshot: plan.publishedSnapshot,
      publishedAt: plan.publishedAt,
      draftRevision: plan.draftRevision,
      publishedRevision: plan.publishedRevision,
    })),
  ];
}

function printPlanReport(plan: ReturnType<typeof buildLearningTopicsV2MigrationPlan>) {
  console.log("DEV-01A learning topics migration");
  console.table(plan.summary);
  if (plan.unresolved.length) {
    console.log("Unresolved plans (no writes are allowed until these are fixed):");
    console.table(plan.unresolved);
  }
  if (plan.skippedUnpublished.length) {
    console.log(`Skipped unpublished plans: ${plan.skippedUnpublished.length}`);
  }
}

async function missingDirectionIds(candidates: LearningPlanMigrationCandidate[]) {
  const expected = [...new Set(candidates.map((candidate) => candidate.directionId))];
  if (!expected.length) return [];
  const found = await prisma.direction.findMany({
    where: { id: { in: expected } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((direction) => direction.id));
  return expected.filter((id) => !foundIds.has(id));
}

async function existingPlanId(
  tx: Prisma.TransactionClient,
  candidate: LearningPlanMigrationCandidate,
) {
  const rows = candidate.kind === "student"
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "learning_plans"
        WHERE "legacy_student_plan_id" = ${candidate.legacyPlanId}::uuid
        LIMIT 1
      `
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "learning_plans"
        WHERE "legacy_group_plan_id" = ${candidate.legacyPlanId}::uuid
        LIMIT 1
      `;
  return rows[0]?.id ?? null;
}

async function insertCandidate(
  tx: Prisma.TransactionClient,
  candidate: LearningPlanMigrationCandidate,
) {
  if (await existingPlanId(tx, candidate)) return "existing" as const;

  const planId = randomUUID();
  const versionId = randomUUID();
  const studentId = candidate.kind === "student" ? candidate.ownerId : null;
  const groupId = candidate.kind === "group" ? candidate.ownerId : null;
  const legacyStudentPlanId = candidate.kind === "student" ? candidate.legacyPlanId : null;
  const legacyGroupPlanId = candidate.kind === "group" ? candidate.legacyPlanId : null;
  const materialsJson = JSON.stringify(candidate.materials);

  await tx.$executeRaw`
    INSERT INTO "learning_plans" (
      "id", "direction_id", "crm_student_id", "crm_group_id", "month",
      "current_version_number", "published_version_number", "created_by_id",
      "legacy_student_plan_id", "legacy_group_plan_id",
      "completion_reward_source_key", "completed_at", "locked_at", "updated_at"
    ) VALUES (
      ${planId}::uuid, ${candidate.directionId}::uuid, ${studentId}, ${groupId},
      ${candidate.month}, ${candidate.version}, ${candidate.version},
      ${candidate.teacherUserId}::uuid, ${legacyStudentPlanId}::uuid,
      ${legacyGroupPlanId}::uuid, ${candidate.completionRewardSourceKey},
      ${candidate.completedAt}, ${candidate.lockedAt}, CURRENT_TIMESTAMP
    )
  `;

  await tx.$executeRaw`
    INSERT INTO "learning_plan_versions" (
      "id", "plan_id", "version", "goal", "expected_result", "skills",
      "checkpoint", "note", "materials", "created_by_id", "source_revision", "published_at"
    ) VALUES (
      ${versionId}::uuid, ${planId}::uuid, ${candidate.version}, ${candidate.goal},
      ${candidate.expectedResult}, ${candidate.skills}, ${candidate.checkpoint},
      ${candidate.note}, ${materialsJson}::jsonb, ${candidate.teacherUserId}::uuid, ${candidate.version},
      ${candidate.publishedAt}
    )
  `;

  for (const topic of candidate.topics) {
    const topicId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "learning_topics" (
        "id", "direction_id", "crm_student_id", "crm_group_id", "title",
        "progress_percent", "legacy_status", "created_by_id",
        "responsible_teacher_id", "legacy_source_key",
        "mastery_reward_source_key", "mastered_at", "updated_at"
      ) VALUES (
        ${topicId}::uuid, ${candidate.directionId}::uuid, ${studentId}, ${groupId},
        ${topic.title}, ${topic.progressPercent}, ${topic.legacyStatus},
        ${candidate.teacherUserId}::uuid, ${candidate.teacherUserId}::uuid,
        ${topic.sourceKey}, ${topic.masteryRewardSourceKey}, ${topic.masteredAt},
        CURRENT_TIMESTAMP
      )
    `;

    if (topic.progressSourceKey && topic.progressPercent !== null) {
      const progressId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "learning_topic_progress" (
          "id", "topic_id", "from_percent", "to_percent", "source",
          "source_key", "comment", "changed_by_id", "occurred_at"
        ) VALUES (
          ${progressId}::uuid, ${topicId}::uuid, NULL, ${topic.progressPercent},
          CAST(${"migration"} AS "LearningTopicProgressSource"),
          ${topic.progressSourceKey}, ${"Imported from the published legacy monthly plan"},
          ${candidate.teacherUserId}::uuid, ${candidate.publishedAt}
        )
      `;
    }

    await tx.$executeRaw`
      INSERT INTO "learning_plan_topics" (
        "id", "plan_version_id", "topic_id", "state", "sort_order",
        "title_snapshot", "mastery_criteria_snapshot"
      ) VALUES (
        ${randomUUID()}::uuid, ${versionId}::uuid, ${topicId}::uuid,
        CAST(${"active"} AS "LearningPlanTopicState"), ${topic.sortOrder},
        ${topic.title}, ${""}
      )
    `;
  }

  return "inserted" as const;
}

async function executeMigration(candidates: LearningPlanMigrationCandidate[]) {
  let inserted = 0;
  let existing = 0;
  for (const candidate of candidates) {
    const result = await prisma.$transaction((tx) => insertCandidate(tx, candidate));
    if (result === "inserted") inserted += 1;
    else existing += 1;
  }
  console.table({ insertedPlans: inserted, existingPlans: existing });
}

async function rollbackMigration() {
  const result = await prisma.$transaction(async (tx) => {
    const deletedPlans = await tx.$executeRaw`
      DELETE FROM "learning_plans"
      WHERE "legacy_student_plan_id" IS NOT NULL OR "legacy_group_plan_id" IS NOT NULL
    `;
    const deletedTopics = await tx.$executeRaw`
      DELETE FROM "learning_topics" AS topic
      WHERE (
        topic."legacy_source_key" LIKE 'student-monthly-plan:%'
        OR topic."legacy_source_key" LIKE 'group-monthly-plan:%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "learning_plan_topics" AS link
        WHERE link."topic_id" = topic."id"
      )
    `;
    return { deletedPlans, deletedTopics };
  });
  console.table(result);
}

async function main() {
  const mode = migrationMode();
  if (mode === "rollback") {
    assertLocalMutationAllowed(mode);
    await rollbackMigration();
    return;
  }

  const inputs = await loadLegacyPlans();
  const plan = buildLearningTopicsV2MigrationPlan(inputs, directionMapFromEnv());
  printPlanReport(plan);

  const missingDirections = await missingDirectionIds(plan.candidates);
  if (missingDirections.length) {
    console.log("Mapped direction ids missing from the local platform database:");
    console.table(missingDirections.map((directionId) => ({ directionId })));
  }

  if (mode === "dry-run") {
    console.log("Dry run complete. No data was changed.");
    return;
  }

  assertLocalMutationAllowed(mode);
  if (plan.unresolved.length || missingDirections.length) {
    throw new Error("Execute aborted: resolve every migration issue first");
  }
  await executeMigration(plan.candidates);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
