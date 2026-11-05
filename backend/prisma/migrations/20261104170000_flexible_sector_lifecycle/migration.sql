-- Keep historical progress, balances and dates unchanged.
ALTER TYPE "LearningSectorStatus" ADD VALUE IF NOT EXISTS 'awaiting_exam';
ALTER TABLE "learning_plans"
 ADD COLUMN "study_started_at" TIMESTAMPTZ(6),
 ADD COLUMN "study_finished_at" TIMESTAMPTZ(6),
 ADD COLUMN "exam_ready_at" TIMESTAMPTZ(6),
 ADD COLUMN "exam_ready_by_id" UUID;
CREATE TABLE "learning_sector_events" (
 "id" UUID NOT NULL,
 "plan_id" UUID NOT NULL,
 "kind" VARCHAR(40) NOT NULL,
 "actor_user_id" UUID,
 "source_key" VARCHAR(255) NOT NULL,
 "crm_class_id" VARCHAR(128),
 "occurred_at" TIMESTAMPTZ(6) NOT NULL,
 "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "details" JSONB NOT NULL DEFAULT '{}',
 CONSTRAINT "learning_sector_events_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "learning_sector_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "learning_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "learning_sector_events_source_key_key" ON "learning_sector_events"("source_key");
CREATE INDEX "learning_sector_events_plan_id_occurred_at_idx" ON "learning_sector_events"("plan_id", "occurred_at");
