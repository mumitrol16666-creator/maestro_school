ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'read';

ALTER TABLE "learning_message_attachments"
  ADD COLUMN "source_key" VARCHAR(191),
  ADD COLUMN "conversation_id" UUID;

UPDATE "learning_message_attachments" AS attachment
SET
  "source_key" = 'legacy:learning-message-attachment:' || attachment."id"::text,
  "conversation_id" = message."conversation_id"
FROM "learning_messages" AS message
WHERE message."id" = attachment."message_id";

ALTER TABLE "learning_message_attachments"
  ALTER COLUMN "source_key" SET NOT NULL,
  ALTER COLUMN "conversation_id" SET NOT NULL;

CREATE UNIQUE INDEX "learning_message_attachments_source_key_key"
  ON "learning_message_attachments"("source_key");
CREATE INDEX "learning_message_attachments_conversation_id_created_at_idx"
  ON "learning_message_attachments"("conversation_id", "created_at");

ALTER TABLE "learning_message_attachments"
  ADD CONSTRAINT "learning_message_attachments_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "learning_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
