CREATE TABLE "app_usage_events" (
    "id" UUID NOT NULL,
    "event_key" VARCHAR(191) NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "section" VARCHAR(64) NOT NULL,
    "path" VARCHAR(500),
    "session_id" VARCHAR(80),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_usage_events_event_key_key" ON "app_usage_events"("event_key");
CREATE INDEX "app_usage_events_user_id_occurred_at_idx" ON "app_usage_events"("user_id", "occurred_at");
CREATE INDEX "app_usage_events_user_id_event_type_occurred_at_idx" ON "app_usage_events"("user_id", "event_type", "occurred_at");
CREATE INDEX "app_usage_events_section_occurred_at_idx" ON "app_usage_events"("section", "occurred_at");
CREATE INDEX "app_usage_events_occurred_at_idx" ON "app_usage_events"("occurred_at");

ALTER TABLE "app_usage_events"
ADD CONSTRAINT "app_usage_events_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
