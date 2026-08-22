ALTER TABLE "student_monthly_plans"
    ADD COLUMN "published_snapshot" JSONB,
    ADD COLUMN "published_at" TIMESTAMPTZ(6),
    ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "published_revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "group_monthly_plans"
    ADD COLUMN "published_snapshot" JSONB,
    ADD COLUMN "published_at" TIMESTAMPTZ(6),
    ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "published_revision" INTEGER NOT NULL DEFAULT 0;
