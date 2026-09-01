-- DEV-01B: immutable plan-version snapshots and CRM direction projection state.

ALTER TABLE "directions"
    ADD COLUMN "crm_is_active" BOOLEAN,
    ADD COLUMN "crm_updated_at" TIMESTAMPTZ(6),
    ADD COLUMN "crm_synced_at" TIMESTAMPTZ(6);

ALTER TABLE "learning_plan_versions"
    ADD COLUMN "materials" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "learning_plan_topics"
    ADD COLUMN "title_snapshot" VARCHAR(1000),
    ADD COLUMN "mastery_criteria_snapshot" TEXT;

UPDATE "learning_plan_topics" AS link
SET
    "title_snapshot" = topic."title",
    "mastery_criteria_snapshot" = topic."mastery_criteria"
FROM "learning_topics" AS topic
WHERE topic."id" = link."topic_id";

ALTER TABLE "learning_plan_topics"
    ALTER COLUMN "title_snapshot" SET NOT NULL,
    ALTER COLUMN "mastery_criteria_snapshot" SET DEFAULT '',
    ALTER COLUMN "mastery_criteria_snapshot" SET NOT NULL;
