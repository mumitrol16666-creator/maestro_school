-- DEV-03B: durable notification idempotency for homework queue events.
ALTER TABLE "user_notifications"
  ADD COLUMN "dedupe_key" VARCHAR(191);

CREATE UNIQUE INDEX "user_notifications_dedupe_key_key"
  ON "user_notifications"("dedupe_key");
