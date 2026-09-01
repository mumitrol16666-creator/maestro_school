CREATE TABLE "parent_visibility_policies" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "show_schedule" BOOLEAN NOT NULL DEFAULT true,
    "show_balance" BOOLEAN NOT NULL DEFAULT true,
    "show_plan_progress" BOOLEAN NOT NULL DEFAULT true,
    "show_achievements" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "parent_visibility_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parent_visibility_requests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "requested_show_schedule" BOOLEAN NOT NULL,
    "requested_show_balance" BOOLEAN NOT NULL,
    "requested_show_plan_progress" BOOLEAN NOT NULL,
    "requested_show_achievements" BOOLEAN NOT NULL,
    "note" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "decided_by_id" UUID,
    "decision_note" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "parent_visibility_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "news_posts"
  ADD COLUMN "show_to_students" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_to_parents" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "parent_visibility_policies_student_id_key" ON "parent_visibility_policies"("student_id");
CREATE INDEX "parent_visibility_policies_updated_by_id_idx" ON "parent_visibility_policies"("updated_by_id");
CREATE INDEX "parent_visibility_requests_student_id_status_created_at_idx" ON "parent_visibility_requests"("student_id", "status", "created_at");
CREATE INDEX "parent_visibility_requests_decided_by_id_idx" ON "parent_visibility_requests"("decided_by_id");
CREATE UNIQUE INDEX "parent_visibility_requests_one_pending_per_student_idx"
  ON "parent_visibility_requests"("student_id") WHERE "status" = 'pending';
CREATE INDEX "news_posts_parent_audience_idx" ON "news_posts"("show_to_parents", "is_published", "published_at");

ALTER TABLE "parent_visibility_policies"
  ADD CONSTRAINT "parent_visibility_policies_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_visibility_policies"
  ADD CONSTRAINT "parent_visibility_policies_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "parent_visibility_requests"
  ADD CONSTRAINT "parent_visibility_requests_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_visibility_requests"
  ADD CONSTRAINT "parent_visibility_requests_decided_by_id_fkey"
  FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
