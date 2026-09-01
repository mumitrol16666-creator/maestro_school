CREATE TYPE "LearningConversationMembershipEventType" AS ENUM (
  'joined',
  'left',
  'write_enabled',
  'write_disabled'
);

ALTER TABLE "learning_conversations"
  ADD COLUMN "scope_key" VARCHAR(191);

CREATE TABLE "learning_conversation_membership_events" (
  "id" UUID NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "conversation_id" UUID NOT NULL,
  "member_id" UUID,
  "user_id" UUID NOT NULL,
  "event" "LearningConversationMembershipEventType" NOT NULL,
  "source" VARCHAR(64) NOT NULL,
  "payload" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_conversation_membership_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_conversation_membership_events_source_key_key"
  ON "learning_conversation_membership_events"("source_key");
CREATE INDEX "learning_conversations_scope_key_status_idx"
  ON "learning_conversations"("scope_key", "status");
CREATE UNIQUE INDEX "learning_conversations_one_active_scope_idx"
  ON "learning_conversations"("scope_key")
  WHERE "scope_key" IS NOT NULL AND "status" = 'active';
CREATE INDEX "learning_conversation_membership_events_conversation_id_occurred_at_idx"
  ON "learning_conversation_membership_events"("conversation_id", "occurred_at");
CREATE INDEX "learning_conversation_membership_events_user_id_occurred_at_idx"
  ON "learning_conversation_membership_events"("user_id", "occurred_at");
CREATE INDEX "learning_conversation_membership_events_member_id_occurred_at_idx"
  ON "learning_conversation_membership_events"("member_id", "occurred_at");

ALTER TABLE "learning_conversation_membership_events"
  ADD CONSTRAINT "learning_conversation_membership_events_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "learning_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_membership_events"
  ADD CONSTRAINT "learning_conversation_membership_events_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "learning_conversation_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_conversation_membership_events"
  ADD CONSTRAINT "learning_conversation_membership_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
