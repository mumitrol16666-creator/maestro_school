ALTER TABLE "learning_conversations"
  RENAME COLUMN "crm_class_id" TO "crm_group_id";

ALTER INDEX "learning_conversations_crm_class_id_status_idx"
  RENAME TO "learning_conversations_crm_group_id_status_idx";
