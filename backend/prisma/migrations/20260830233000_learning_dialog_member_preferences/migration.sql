ALTER TABLE "learning_conversation_members"
ADD COLUMN "archived_at" TIMESTAMPTZ(6);

CREATE INDEX "learning_conversation_members_user_id_archived_at_conversation_id_idx"
ON "learning_conversation_members"("user_id", "archived_at", "conversation_id");
