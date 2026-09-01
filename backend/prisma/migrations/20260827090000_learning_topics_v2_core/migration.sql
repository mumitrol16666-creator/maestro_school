-- DEV-01A: normalized learning topics and versioned plans.
-- This migration creates the new storage only. Existing lesson and plan routes
-- continue to use the legacy tables while FEATURE_LEARNING_TOPICS_V2 is off.

CREATE TYPE "LearningTopicProgressSource" AS ENUM (
    'migration',
    'teacher',
    'lesson',
    'correction'
);

CREATE TYPE "LearningPlanTopicState" AS ENUM (
    'active',
    'transferred',
    'replaced'
);

ALTER TABLE "directions"
    ADD COLUMN "crm_direction_id" VARCHAR(128);

CREATE UNIQUE INDEX "directions_crm_direction_id_key"
    ON "directions"("crm_direction_id");

CREATE TABLE "learning_topics" (
    "id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "crm_student_id" VARCHAR(128),
    "crm_group_id" VARCHAR(128),
    "title" VARCHAR(1000) NOT NULL,
    "mastery_criteria" TEXT NOT NULL DEFAULT '',
    "progress_percent" INTEGER DEFAULT 0,
    "legacy_status" VARCHAR(32),
    "created_by_id" UUID,
    "responsible_teacher_id" UUID,
    "legacy_source_key" VARCHAR(255),
    "mastery_reward_source_key" VARCHAR(255),
    "mastered_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_topics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_topics_owner_check"
        CHECK (num_nonnulls("crm_student_id", "crm_group_id") = 1),
    CONSTRAINT "learning_topics_progress_percent_check"
        CHECK ("progress_percent" IS NULL OR "progress_percent" BETWEEN 0 AND 100)
);

CREATE TABLE "learning_topic_progress" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "from_percent" INTEGER,
    "to_percent" INTEGER NOT NULL,
    "source" "LearningTopicProgressSource" NOT NULL,
    "source_key" VARCHAR(255) NOT NULL,
    "comment" TEXT,
    "changed_by_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_topic_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_topic_progress_from_percent_check"
        CHECK ("from_percent" IS NULL OR "from_percent" BETWEEN 0 AND 100),
    CONSTRAINT "learning_topic_progress_to_percent_check"
        CHECK ("to_percent" BETWEEN 0 AND 100)
);

CREATE TABLE "learning_plans" (
    "id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "crm_student_id" VARCHAR(128),
    "crm_group_id" VARCHAR(128),
    "month" VARCHAR(7) NOT NULL,
    "current_version_number" INTEGER NOT NULL DEFAULT 0,
    "published_version_number" INTEGER,
    "created_by_id" UUID,
    "legacy_student_plan_id" UUID,
    "legacy_group_plan_id" UUID,
    "completion_reward_source_key" VARCHAR(255),
    "completed_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_plans_owner_check"
        CHECK (num_nonnulls("crm_student_id", "crm_group_id") = 1),
    CONSTRAINT "learning_plans_legacy_source_check"
        CHECK (num_nonnulls("legacy_student_plan_id", "legacy_group_plan_id") <= 1),
    CONSTRAINT "learning_plans_month_check"
        CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "learning_plans_current_version_number_check"
        CHECK ("current_version_number" >= 0),
    CONSTRAINT "learning_plans_published_version_number_check"
        CHECK ("published_version_number" IS NULL OR "published_version_number" > 0)
);

CREATE TABLE "learning_plan_versions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "expected_result" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '',
    "checkpoint" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "source_revision" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_plan_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_plan_versions_version_check" CHECK ("version" > 0)
);

CREATE TABLE "learning_plan_topics" (
    "id" UUID NOT NULL,
    "plan_version_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "state" "LearningPlanTopicState" NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "replacement_topic_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_plan_topics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_plan_topics_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "learning_plan_topics_replacement_check"
        CHECK ("replacement_topic_id" IS NULL OR "replacement_topic_id" <> "topic_id")
);

CREATE UNIQUE INDEX "learning_topics_legacy_source_key_key"
    ON "learning_topics"("legacy_source_key");
CREATE UNIQUE INDEX "learning_topics_mastery_reward_source_key_key"
    ON "learning_topics"("mastery_reward_source_key");
CREATE INDEX "learning_topics_crm_student_id_direction_id_archived_at_idx"
    ON "learning_topics"("crm_student_id", "direction_id", "archived_at");
CREATE INDEX "learning_topics_crm_group_id_direction_id_archived_at_idx"
    ON "learning_topics"("crm_group_id", "direction_id", "archived_at");
CREATE INDEX "learning_topics_responsible_teacher_id_archived_at_idx"
    ON "learning_topics"("responsible_teacher_id", "archived_at");
CREATE INDEX "learning_topics_direction_id_progress_percent_idx"
    ON "learning_topics"("direction_id", "progress_percent");

CREATE UNIQUE INDEX "learning_topic_progress_source_key_key"
    ON "learning_topic_progress"("source_key");
CREATE INDEX "learning_topic_progress_topic_id_occurred_at_idx"
    ON "learning_topic_progress"("topic_id", "occurred_at");
CREATE INDEX "learning_topic_progress_changed_by_id_occurred_at_idx"
    ON "learning_topic_progress"("changed_by_id", "occurred_at");

CREATE UNIQUE INDEX "learning_plans_legacy_student_plan_id_key"
    ON "learning_plans"("legacy_student_plan_id");
CREATE UNIQUE INDEX "learning_plans_legacy_group_plan_id_key"
    ON "learning_plans"("legacy_group_plan_id");
CREATE UNIQUE INDEX "learning_plans_completion_reward_source_key_key"
    ON "learning_plans"("completion_reward_source_key");
CREATE UNIQUE INDEX "learning_plans_student_owner_month_key"
    ON "learning_plans"("crm_student_id", "direction_id", "month")
    WHERE "crm_student_id" IS NOT NULL AND "crm_group_id" IS NULL;
CREATE UNIQUE INDEX "learning_plans_group_owner_month_key"
    ON "learning_plans"("crm_group_id", "direction_id", "month")
    WHERE "crm_group_id" IS NOT NULL AND "crm_student_id" IS NULL;
CREATE INDEX "learning_plans_direction_id_month_idx"
    ON "learning_plans"("direction_id", "month");
CREATE INDEX "learning_plans_crm_student_id_month_idx"
    ON "learning_plans"("crm_student_id", "month");
CREATE INDEX "learning_plans_crm_group_id_month_idx"
    ON "learning_plans"("crm_group_id", "month");
CREATE INDEX "learning_plans_created_by_id_idx"
    ON "learning_plans"("created_by_id");

CREATE UNIQUE INDEX "learning_plan_versions_plan_id_version_key"
    ON "learning_plan_versions"("plan_id", "version");
CREATE INDEX "learning_plan_versions_plan_id_published_at_idx"
    ON "learning_plan_versions"("plan_id", "published_at");
CREATE INDEX "learning_plan_versions_created_by_id_idx"
    ON "learning_plan_versions"("created_by_id");

CREATE UNIQUE INDEX "learning_plan_topics_plan_version_id_topic_id_key"
    ON "learning_plan_topics"("plan_version_id", "topic_id");
CREATE INDEX "learning_plan_topics_topic_id_idx"
    ON "learning_plan_topics"("topic_id");
CREATE INDEX "learning_plan_topics_replacement_topic_id_idx"
    ON "learning_plan_topics"("replacement_topic_id");
CREATE INDEX "learning_plan_topics_plan_version_id_state_sort_order_idx"
    ON "learning_plan_topics"("plan_version_id", "state", "sort_order");

ALTER TABLE "learning_topics"
    ADD CONSTRAINT "learning_topics_direction_id_fkey"
    FOREIGN KEY ("direction_id") REFERENCES "directions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_topics"
    ADD CONSTRAINT "learning_topics_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_topics"
    ADD CONSTRAINT "learning_topics_responsible_teacher_id_fkey"
    FOREIGN KEY ("responsible_teacher_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_topic_progress"
    ADD CONSTRAINT "learning_topic_progress_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_topic_progress"
    ADD CONSTRAINT "learning_topic_progress_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_plans"
    ADD CONSTRAINT "learning_plans_direction_id_fkey"
    FOREIGN KEY ("direction_id") REFERENCES "directions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_plans"
    ADD CONSTRAINT "learning_plans_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_plans"
    ADD CONSTRAINT "learning_plans_legacy_student_plan_id_fkey"
    FOREIGN KEY ("legacy_student_plan_id") REFERENCES "student_monthly_plans"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_plans"
    ADD CONSTRAINT "learning_plans_legacy_group_plan_id_fkey"
    FOREIGN KEY ("legacy_group_plan_id") REFERENCES "group_monthly_plans"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_plan_versions"
    ADD CONSTRAINT "learning_plan_versions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "learning_plans"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_plan_versions"
    ADD CONSTRAINT "learning_plan_versions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_plan_topics"
    ADD CONSTRAINT "learning_plan_topics_plan_version_id_fkey"
    FOREIGN KEY ("plan_version_id") REFERENCES "learning_plan_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_plan_topics"
    ADD CONSTRAINT "learning_plan_topics_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_plan_topics"
    ADD CONSTRAINT "learning_plan_topics_replacement_topic_id_fkey"
    FOREIGN KEY ("replacement_topic_id") REFERENCES "learning_topics"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
