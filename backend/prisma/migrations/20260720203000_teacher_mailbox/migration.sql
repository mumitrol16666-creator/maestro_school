ALTER TYPE "UserNotificationType"
ADD VALUE IF NOT EXISTS 'direct_message_received';

CREATE TABLE "teacher_conversations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teacher_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teacher_conversations_student_id_teacher_id_key"
ON "teacher_conversations"("student_id", "teacher_id");

CREATE INDEX "teacher_conversations_student_id_last_message_at_idx"
ON "teacher_conversations"("student_id", "last_message_at" DESC);

CREATE INDEX "teacher_conversations_teacher_id_last_message_at_idx"
ON "teacher_conversations"("teacher_id", "last_message_at" DESC);

CREATE INDEX "teacher_messages_conversation_id_created_at_idx"
ON "teacher_messages"("conversation_id", "created_at");

CREATE INDEX "teacher_messages_conversation_id_read_at_idx"
ON "teacher_messages"("conversation_id", "read_at");

CREATE INDEX "teacher_messages_sender_id_idx"
ON "teacher_messages"("sender_id");

ALTER TABLE "teacher_conversations"
ADD CONSTRAINT "teacher_conversations_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_conversations"
ADD CONSTRAINT "teacher_conversations_teacher_id_fkey"
FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_messages"
ADD CONSTRAINT "teacher_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "teacher_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_messages"
ADD CONSTRAINT "teacher_messages_sender_id_fkey"
FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
