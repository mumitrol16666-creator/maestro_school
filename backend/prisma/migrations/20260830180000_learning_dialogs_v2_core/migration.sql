CREATE TYPE "LearningConversationType" AS ENUM ('learning_direction', 'curator', 'crm_group');
CREATE TYPE "LearningConversationStatus" AS ENUM ('active', 'read_only', 'closed');
CREATE TYPE "LearningConversationMemberRole" AS ENUM ('student', 'teacher', 'curator');
CREATE TYPE "LearningMessageState" AS ENUM ('visible', 'retracted', 'hidden');
CREATE TYPE "LearningMessageVersionKind" AS ENUM ('created', 'edited', 'retracted');
CREATE TYPE "LearningMessageReportStatus" AS ENUM ('open', 'resolved', 'dismissed');
CREATE TYPE "LearningConversationModerationActionType" AS ENUM (
  'message_hidden',
  'member_restricted',
  'member_unrestricted',
  'report_resolved',
  'report_dismissed'
);

CREATE TABLE "learning_conversations" (
  "id" UUID NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "type" "LearningConversationType" NOT NULL,
  "status" "LearningConversationStatus" NOT NULL DEFAULT 'active',
  "title" VARCHAR(255),
  "crm_direction_id" VARCHAR(64),
  "crm_class_id" VARCHAR(64),
  "context" JSONB,
  "last_message_at" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "text_retention_until" TIMESTAMPTZ(6),
  "attachment_retention_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_conversation_members" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "LearningConversationMemberRole" NOT NULL,
  "can_write" BOOLEAN NOT NULL DEFAULT true,
  "notifications_muted" BOOLEAN NOT NULL DEFAULT false,
  "last_read_at" TIMESTAMPTZ(6),
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "left_at" TIMESTAMPTZ(6),
  "restricted_until" TIMESTAMPTZ(6),
  "restriction_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_conversation_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_messages" (
  "id" UUID NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "conversation_id" UUID NOT NULL,
  "author_id" UUID,
  "state" "LearningMessageState" NOT NULL DEFAULT 'visible',
  "context_type" VARCHAR(64),
  "context_id" VARCHAR(191),
  "edited_at" TIMESTAMPTZ(6),
  "retracted_at" TIMESTAMPTZ(6),
  "hidden_at" TIMESTAMPTZ(6),
  "hidden_by_id" UUID,
  "hidden_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_message_versions" (
  "id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "kind" "LearningMessageVersionKind" NOT NULL,
  "body" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_message_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_message_attachments" (
  "id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "uploader_id" UUID,
  "storage_key" VARCHAR(512) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(128) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "quarantine_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_message_reports" (
  "id" UUID NOT NULL,
  "report_key" VARCHAR(191) NOT NULL,
  "message_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "reporter_id" UUID,
  "reason" TEXT NOT NULL,
  "status" "LearningMessageReportStatus" NOT NULL DEFAULT 'open',
  "resolved_by_id" UUID,
  "resolution" TEXT,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_message_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_conversation_moderation_actions" (
  "id" UUID NOT NULL,
  "action_key" VARCHAR(191) NOT NULL,
  "conversation_id" UUID NOT NULL,
  "message_id" UUID,
  "target_user_id" UUID,
  "actor_id" UUID,
  "action" "LearningConversationModerationActionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "restriction_until" TIMESTAMPTZ(6),
  "payload" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_conversation_moderation_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_conversations_source_key_key" ON "learning_conversations"("source_key");
CREATE INDEX "learning_conversations_type_status_last_message_at_idx" ON "learning_conversations"("type", "status", "last_message_at");
CREATE INDEX "learning_conversations_crm_direction_id_status_idx" ON "learning_conversations"("crm_direction_id", "status");
CREATE INDEX "learning_conversations_crm_class_id_status_idx" ON "learning_conversations"("crm_class_id", "status");
CREATE INDEX "learning_conversations_closed_at_idx" ON "learning_conversations"("closed_at");
CREATE UNIQUE INDEX "learning_conversation_members_conversation_id_user_id_key" ON "learning_conversation_members"("conversation_id", "user_id");
CREATE INDEX "learning_conversation_members_user_id_left_at_conversation_id_idx" ON "learning_conversation_members"("user_id", "left_at", "conversation_id");
CREATE INDEX "learning_conversation_members_conversation_id_left_at_idx" ON "learning_conversation_members"("conversation_id", "left_at");
CREATE UNIQUE INDEX "learning_messages_source_key_key" ON "learning_messages"("source_key");
CREATE INDEX "learning_messages_conversation_id_created_at_idx" ON "learning_messages"("conversation_id", "created_at");
CREATE INDEX "learning_messages_author_id_created_at_idx" ON "learning_messages"("author_id", "created_at");
CREATE INDEX "learning_messages_context_type_context_id_idx" ON "learning_messages"("context_type", "context_id");
CREATE INDEX "learning_messages_state_created_at_idx" ON "learning_messages"("state", "created_at");
CREATE UNIQUE INDEX "learning_message_versions_message_id_version_key" ON "learning_message_versions"("message_id", "version");
CREATE INDEX "learning_message_versions_message_id_created_at_idx" ON "learning_message_versions"("message_id", "created_at");
CREATE INDEX "learning_message_versions_created_by_id_idx" ON "learning_message_versions"("created_by_id");
CREATE UNIQUE INDEX "learning_message_attachments_storage_key_key" ON "learning_message_attachments"("storage_key");
CREATE INDEX "learning_message_attachments_message_id_created_at_idx" ON "learning_message_attachments"("message_id", "created_at");
CREATE INDEX "learning_message_attachments_quarantine_status_created_at_idx" ON "learning_message_attachments"("quarantine_status", "created_at");
CREATE INDEX "learning_message_attachments_deleted_at_idx" ON "learning_message_attachments"("deleted_at");
CREATE UNIQUE INDEX "learning_message_reports_report_key_key" ON "learning_message_reports"("report_key");
CREATE INDEX "learning_message_reports_status_created_at_idx" ON "learning_message_reports"("status", "created_at");
CREATE INDEX "learning_message_reports_message_id_created_at_idx" ON "learning_message_reports"("message_id", "created_at");
CREATE INDEX "learning_message_reports_version_id_idx" ON "learning_message_reports"("version_id");
CREATE INDEX "learning_message_reports_reporter_id_idx" ON "learning_message_reports"("reporter_id");
CREATE UNIQUE INDEX "learning_conversation_moderation_actions_action_key_key" ON "learning_conversation_moderation_actions"("action_key");
CREATE INDEX "learning_conversation_moderation_actions_conversation_id_created_at_idx" ON "learning_conversation_moderation_actions"("conversation_id", "created_at");
CREATE INDEX "learning_conversation_moderation_actions_message_id_created_at_idx" ON "learning_conversation_moderation_actions"("message_id", "created_at");
CREATE INDEX "learning_conversation_moderation_actions_target_user_id_created_at_idx" ON "learning_conversation_moderation_actions"("target_user_id", "created_at");
CREATE INDEX "learning_conversation_moderation_actions_actor_id_created_at_idx" ON "learning_conversation_moderation_actions"("actor_id", "created_at");

ALTER TABLE "learning_conversation_members" ADD CONSTRAINT "learning_conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "learning_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_members" ADD CONSTRAINT "learning_conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_messages" ADD CONSTRAINT "learning_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "learning_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_messages" ADD CONSTRAINT "learning_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_messages" ADD CONSTRAINT "learning_messages_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_message_versions" ADD CONSTRAINT "learning_message_versions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "learning_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_message_versions" ADD CONSTRAINT "learning_message_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_message_attachments" ADD CONSTRAINT "learning_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "learning_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_message_attachments" ADD CONSTRAINT "learning_message_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_message_reports" ADD CONSTRAINT "learning_message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "learning_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_message_reports" ADD CONSTRAINT "learning_message_reports_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "learning_message_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_message_reports" ADD CONSTRAINT "learning_message_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_message_reports" ADD CONSTRAINT "learning_message_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_moderation_actions" ADD CONSTRAINT "learning_conversation_moderation_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "learning_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_moderation_actions" ADD CONSTRAINT "learning_conversation_moderation_actions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "learning_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_moderation_actions" ADD CONSTRAINT "learning_conversation_moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_moderation_actions" ADD CONSTRAINT "learning_conversation_moderation_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
