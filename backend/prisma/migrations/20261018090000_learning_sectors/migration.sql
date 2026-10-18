-- Секторы вместо планов месяца: план получает порядковый номер и статус,
-- появляются шаблоны ступеней и предложения ученика.

CREATE TYPE "LearningSectorStatus" AS ENUM ('active', 'closed');
CREATE TYPE "SectorTemplateLine" AS ENUM ('melody', 'chords', 'theory', 'song', 'other');
CREATE TYPE "LearningSectorProposalKind" AS ENUM ('topic', 'song', 'goal');
CREATE TYPE "LearningSectorProposalStatus" AS ENUM ('new', 'accepted', 'declined');

CREATE TABLE "sector_templates" (
  "id" UUID NOT NULL,
  "direction_id" UUID,
  "number" INTEGER NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "prepared_test_id" VARCHAR(64),
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sector_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sector_templates_direction_id_number_idx" ON "sector_templates"("direction_id", "number");
ALTER TABLE "sector_templates"
  ADD CONSTRAINT "sector_templates_direction_id_fkey"
  FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sector_template_topics" (
  "id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "line" "SectorTemplateLine" NOT NULL DEFAULT 'other',
  "title" VARCHAR(1000) NOT NULL,
  "mastery_criteria" TEXT NOT NULL DEFAULT '',
  "materials" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "sector_template_topics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sector_template_topics_template_id_sort_order_idx" ON "sector_template_topics"("template_id", "sort_order");
ALTER TABLE "sector_template_topics"
  ADD CONSTRAINT "sector_template_topics_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "sector_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_plans"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status" "LearningSectorStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "template_step_id" UUID,
  ADD COLUMN "prepared_test_id" VARCHAR(64),
  ADD COLUMN "test_passed_at" TIMESTAMPTZ(6),
  ADD COLUMN "closed_at" TIMESTAMPTZ(6),
  ADD COLUMN "close_reason" VARCHAR(32);
ALTER TABLE "learning_plans"
  ADD CONSTRAINT "learning_plans_template_step_id_fkey"
  FOREIGN KEY ("template_step_id") REFERENCES "sector_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Существующие планы становятся секторами 1, 2, … по порядку месяцев.
WITH ordered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE("crm_student_id", ''), COALESCE("crm_group_id", ''), "direction_id"
           ORDER BY "month", "created_at", "id"
         ) AS seq
  FROM "learning_plans"
)
UPDATE "learning_plans" p SET "sequence" = o.seq FROM ordered o WHERE o."id" = p."id";

-- Завершённые планы закрыты; из незавершённых активным остаётся только последний.
UPDATE "learning_plans"
SET "status" = 'closed', "closed_at" = "completed_at", "close_reason" = 'completed'
WHERE "completed_at" IS NOT NULL;

WITH latest AS (
  SELECT DISTINCT ON (COALESCE("crm_student_id", ''), COALESCE("crm_group_id", ''), "direction_id") "id"
  FROM "learning_plans"
  WHERE "status" = 'active'
  ORDER BY COALESCE("crm_student_id", ''), COALESCE("crm_group_id", ''), "direction_id", "sequence" DESC
)
UPDATE "learning_plans"
SET "status" = 'closed', "closed_at" = CURRENT_TIMESTAMP, "close_reason" = 'superseded'
WHERE "status" = 'active' AND "id" NOT IN (SELECT "id" FROM latest);

DROP INDEX IF EXISTS "learning_plans_student_owner_month_key";
DROP INDEX IF EXISTS "learning_plans_group_owner_month_key";
DROP INDEX IF EXISTS "learning_plans_student_direction_month_key";
DROP INDEX IF EXISTS "learning_plans_group_direction_month_key";

CREATE UNIQUE INDEX "learning_plans_student_direction_sequence_key"
  ON "learning_plans"("crm_student_id", "direction_id", "sequence")
  WHERE "crm_student_id" IS NOT NULL AND "crm_group_id" IS NULL;
CREATE UNIQUE INDEX "learning_plans_group_direction_sequence_key"
  ON "learning_plans"("crm_group_id", "direction_id", "sequence")
  WHERE "crm_group_id" IS NOT NULL AND "crm_student_id" IS NULL;
CREATE UNIQUE INDEX "learning_plans_student_direction_active_key"
  ON "learning_plans"("crm_student_id", "direction_id")
  WHERE "crm_student_id" IS NOT NULL AND "crm_group_id" IS NULL AND "status" = 'active';
CREATE UNIQUE INDEX "learning_plans_group_direction_active_key"
  ON "learning_plans"("crm_group_id", "direction_id")
  WHERE "crm_group_id" IS NOT NULL AND "crm_student_id" IS NULL AND "status" = 'active';
CREATE INDEX "learning_plans_crm_student_id_direction_id_status_idx" ON "learning_plans"("crm_student_id", "direction_id", "status");
CREATE INDEX "learning_plans_crm_group_id_direction_id_status_idx" ON "learning_plans"("crm_group_id", "direction_id", "status");

CREATE TABLE "learning_sector_proposals" (
  "id" UUID NOT NULL,
  "plan_id" UUID,
  "direction_id" UUID NOT NULL,
  "crm_student_id" VARCHAR(128) NOT NULL,
  "student_user_id" UUID NOT NULL,
  "kind" "LearningSectorProposalKind" NOT NULL DEFAULT 'topic',
  "text" TEXT NOT NULL,
  "link" VARCHAR(1024),
  "status" "LearningSectorProposalStatus" NOT NULL DEFAULT 'new',
  "teacher_reply" TEXT,
  "accepted_topic_id" UUID,
  "decided_by_id" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_sector_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learning_sector_proposals_crm_student_id_direction_id_status_created_at_idx"
  ON "learning_sector_proposals"("crm_student_id", "direction_id", "status", "created_at");
CREATE INDEX "learning_sector_proposals_student_user_id_created_at_idx"
  ON "learning_sector_proposals"("student_user_id", "created_at");
ALTER TABLE "learning_sector_proposals"
  ADD CONSTRAINT "learning_sector_proposals_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "learning_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "learning_sector_proposals_direction_id_fkey"
  FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "learning_sector_proposals_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "learning_sector_proposals_decided_by_id_fkey"
  FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'sector_proposal_created';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'sector_proposal_decided';
