CREATE TABLE "admin_journal_entries" (
  "id" UUID NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "severity_rank" INTEGER NOT NULL,
  "source" VARCHAR(64) NOT NULL,
  "linked_entity_type" VARCHAR(64) NOT NULL,
  "linked_entity_id" VARCHAR(191) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "summary" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'new',
  "resolution" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "admin_journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_journal_actions" (
  "id" UUID NOT NULL,
  "action_key" VARCHAR(191) NOT NULL,
  "entry_id" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "from_status" VARCHAR(32),
  "to_status" VARCHAR(32),
  "note" TEXT,
  "actor_id" UUID,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_journal_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_journal_entries_source_key_key"
  ON "admin_journal_entries"("source_key");
CREATE UNIQUE INDEX "admin_journal_actions_action_key_key"
  ON "admin_journal_actions"("action_key");
CREATE INDEX "admin_journal_entries_status_severity_rank_created_at_idx"
  ON "admin_journal_entries"("status", "severity_rank", "created_at");
CREATE INDEX "admin_journal_entries_type_status_created_at_idx"
  ON "admin_journal_entries"("type", "status", "created_at");
CREATE INDEX "admin_journal_entries_source_status_created_at_idx"
  ON "admin_journal_entries"("source", "status", "created_at");
CREATE INDEX "admin_journal_entries_linked_entity_type_linked_entity_id_idx"
  ON "admin_journal_entries"("linked_entity_type", "linked_entity_id");
CREATE INDEX "admin_journal_actions_entry_id_created_at_idx"
  ON "admin_journal_actions"("entry_id", "created_at");
CREATE INDEX "admin_journal_actions_actor_id_created_at_idx"
  ON "admin_journal_actions"("actor_id", "created_at");

ALTER TABLE "admin_journal_actions"
  ADD CONSTRAINT "admin_journal_actions_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "admin_journal_entries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_journal_actions"
  ADD CONSTRAINT "admin_journal_actions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
