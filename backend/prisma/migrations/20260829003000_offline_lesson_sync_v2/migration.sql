ALTER TABLE "offline_lesson_student_checks"
  ADD COLUMN "sync_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sync_status" VARCHAR(32) NOT NULL DEFAULT 'synced',
  ADD COLUMN "last_sync_error" TEXT,
  ADD COLUMN "synced_at" TIMESTAMPTZ(6);

CREATE TABLE "offline_lesson_projections" (
  "crm_class_id" VARCHAR(128) NOT NULL,
  "crm_teacher_id" VARCHAR(128),
  "status" VARCHAR(64) NOT NULL,
  "lesson_payload" JSONB NOT NULL,
  "roster_payload" JSONB,
  "roster_version" VARCHAR(64),
  "crm_updated_at" TIMESTAMPTZ(6),
  "last_synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sync_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "offline_lesson_projections_pkey" PRIMARY KEY ("crm_class_id")
);

CREATE TABLE "offline_lesson_reports" (
  "id" UUID NOT NULL,
  "crm_class_id" VARCHAR(128) NOT NULL,
  "author_user_id" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'editing',
  "current_version" INTEGER NOT NULL DEFAULT 0,
  "confirmed_version" INTEGER,
  "crm_confirmed_at" TIMESTAMPTZ(6),
  "correction_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "offline_lesson_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offline_lesson_report_versions" (
  "id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "author_user_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "attendance_payload" JSONB NOT NULL,
  "roster_version" VARCHAR(64),
  "state" VARCHAR(32) NOT NULL DEFAULT 'submitted',
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawn_at" TIMESTAMPTZ(6),
  "withdrawn_by_id" UUID,
  "withdraw_reason" TEXT,
  "crm_delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_lesson_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offline_lesson_drafts" (
  "id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "roster_version" VARCHAR(64),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "offline_lesson_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_outbox_events" (
  "id" UUID NOT NULL,
  "aggregate_type" VARCHAR(64) NOT NULL,
  "aggregate_id" VARCHAR(191) NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotency_key" VARCHAR(191) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "response_payload" JSONB,
  "next_attempt_at" TIMESTAMPTZ(6),
  "processing_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "crm_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_sync_conflicts" (
  "id" UUID NOT NULL,
  "outbox_event_id" UUID,
  "crm_class_id" VARCHAR(128) NOT NULL,
  "kind" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'open',
  "local_payload" JSONB NOT NULL,
  "crm_payload" JSONB,
  "error_message" TEXT NOT NULL,
  "resolution" VARCHAR(64),
  "resolution_note" TEXT,
  "resolved_by_id" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "crm_sync_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_lesson_reports_crm_class_id_key" ON "offline_lesson_reports"("crm_class_id");
CREATE UNIQUE INDEX "offline_lesson_report_versions_report_id_version_key" ON "offline_lesson_report_versions"("report_id", "version");
CREATE UNIQUE INDEX "offline_lesson_drafts_report_id_owner_user_id_key" ON "offline_lesson_drafts"("report_id", "owner_user_id");
CREATE UNIQUE INDEX "crm_outbox_events_idempotency_key_key" ON "crm_outbox_events"("idempotency_key");

CREATE INDEX "offline_lesson_projections_crm_teacher_id_status_idx" ON "offline_lesson_projections"("crm_teacher_id", "status");
CREATE INDEX "offline_lesson_projections_last_synced_at_idx" ON "offline_lesson_projections"("last_synced_at");
CREATE INDEX "offline_lesson_reports_author_user_id_status_idx" ON "offline_lesson_reports"("author_user_id", "status");
CREATE INDEX "offline_lesson_reports_status_updated_at_idx" ON "offline_lesson_reports"("status", "updated_at");
CREATE INDEX "offline_lesson_report_versions_author_user_id_submitted_at_idx" ON "offline_lesson_report_versions"("author_user_id", "submitted_at");
CREATE INDEX "offline_lesson_drafts_expires_at_idx" ON "offline_lesson_drafts"("expires_at");
CREATE INDEX "crm_outbox_events_status_next_attempt_at_created_at_idx" ON "crm_outbox_events"("status", "next_attempt_at", "created_at");
CREATE INDEX "crm_outbox_events_aggregate_type_aggregate_id_created_at_idx" ON "crm_outbox_events"("aggregate_type", "aggregate_id", "created_at");
CREATE INDEX "crm_sync_conflicts_crm_class_id_status_created_at_idx" ON "crm_sync_conflicts"("crm_class_id", "status", "created_at");
CREATE INDEX "crm_sync_conflicts_status_created_at_idx" ON "crm_sync_conflicts"("status", "created_at");

ALTER TABLE "offline_lesson_reports"
  ADD CONSTRAINT "offline_lesson_reports_crm_class_id_fkey"
  FOREIGN KEY ("crm_class_id") REFERENCES "offline_lesson_projections"("crm_class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offline_lesson_report_versions"
  ADD CONSTRAINT "offline_lesson_report_versions_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "offline_lesson_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offline_lesson_drafts"
  ADD CONSTRAINT "offline_lesson_drafts_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "offline_lesson_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm_sync_conflicts"
  ADD CONSTRAINT "crm_sync_conflicts_outbox_event_id_fkey"
  FOREIGN KEY ("outbox_event_id") REFERENCES "crm_outbox_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
