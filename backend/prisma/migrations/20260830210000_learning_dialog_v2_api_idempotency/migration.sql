ALTER TABLE "learning_message_versions"
ADD COLUMN "source_key" VARCHAR(191);

UPDATE "learning_message_versions"
SET "source_key" = 'migration:learning-message-version:' || "id"::text
WHERE "source_key" IS NULL;

ALTER TABLE "learning_message_versions"
ALTER COLUMN "source_key" SET NOT NULL;

CREATE UNIQUE INDEX "learning_message_versions_source_key_key"
ON "learning_message_versions"("source_key");
