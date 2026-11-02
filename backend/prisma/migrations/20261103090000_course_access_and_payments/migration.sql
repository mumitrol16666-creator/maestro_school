-- Stage 4: paid courses. Course price and the school flag, paid access, «Я оплатил» requests,
-- payment details, notification types and the payment permission.

-- CreateEnum
CREATE TYPE "CourseAccessSource" AS ENUM ('payment', 'admin_grant');
-- CreateEnum
CREATE TYPE "CourseAccessRevokeReason" AS ENUM ('refund', 'admin');
-- CreateEnum
CREATE TYPE "CoursePaymentStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- AlterEnum
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'course_payment_requested';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'course_access_granted';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'course_payment_rejected';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'course_access_revoked';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "free_lessons_count" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "included_in_school" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_kzt" INTEGER;

-- price_kzt null means «not for sale»: the course is open to everyone, as every course is today.
ALTER TABLE "courses" ADD CONSTRAINT "courses_price_kzt_positive" CHECK ("price_kzt" IS NULL OR "price_kzt" > 0);
ALTER TABLE "courses" ADD CONSTRAINT "courses_free_lessons_count_non_negative" CHECK ("free_lessons_count" >= 0);

-- CreateTable
CREATE TABLE "course_access" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "source" "CourseAccessSource" NOT NULL,
    "payment_request_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "granted_by_id" UUID,
    "grant_note" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_id" UUID,
    "revoke_reason" "CourseAccessRevokeReason",
    "revoke_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "course_access_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "course_payment_requests" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "payer_user_id" UUID NOT NULL,
    "amount_kzt" INTEGER NOT NULL,
    "status" "CoursePaymentStatus" NOT NULL DEFAULT 'pending',
    "payer_note" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "refunded_at" TIMESTAMPTZ(6),
    "refunded_by_id" UUID,
    "refund_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "course_payment_requests_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "course_payment_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kaspi_pay_url" VARCHAR(1024),
    "transfer_phone" VARCHAR(32),
    "recipient_name" VARCHAR(255),
    "hint" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "course_payment_settings_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "course_access_payment_request_id_key" ON "course_access"("payment_request_id");
-- CreateIndex
CREATE INDEX "course_access_student_id_course_id_expires_at_idx" ON "course_access"("student_id", "course_id", "expires_at");
-- CreateIndex
CREATE INDEX "course_access_course_id_idx" ON "course_access"("course_id");
-- CreateIndex
CREATE INDEX "course_payment_requests_status_created_at_idx" ON "course_payment_requests"("status", "created_at");
-- CreateIndex
CREATE INDEX "course_payment_requests_student_id_course_id_idx" ON "course_payment_requests"("student_id", "course_id");
-- CreateIndex
CREATE INDEX "course_payment_requests_course_id_idx" ON "course_payment_requests"("course_id");
-- AddForeignKey
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "course_payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_payer_user_id_fkey" FOREIGN KEY ("payer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_refunded_by_id_fkey" FOREIGN KEY ("refunded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "course_payment_settings" ADD CONSTRAINT "course_payment_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express these; schema.prisma only mentions them in comments.
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_amount_kzt_positive" CHECK ("amount_kzt" > 0);
-- A refund exists only for a confirmed payment (the service refunds `confirmed` only).
ALTER TABLE "course_payment_requests" ADD CONSTRAINT "course_payment_requests_refund_needs_confirmed" CHECK ("refunded_at" IS NULL OR "status" = 'confirmed');
ALTER TABLE "course_access" ADD CONSTRAINT "course_access_period_valid" CHECK ("expires_at" > "starts_at");
ALTER TABLE "course_payment_settings" ADD CONSTRAINT "course_payment_settings_single_row" CHECK ("id" = 1);

-- One pending «Я оплатил» per student and course: a second press while one waits is a conflict.
CREATE UNIQUE INDEX "course_payment_requests_one_pending_idx"
  ON "course_payment_requests"("student_id", "course_id") WHERE "status" = 'pending';

-- The single row of payment details.
INSERT INTO "course_payment_settings" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

-- Permission to work with course payments: school administrators only.
INSERT INTO permissions (id, code, description, created_at)
VALUES (gen_random_uuid(), 'course_payments.manage', 'Confirm, reject and refund course payments, grant and revoke course access', NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'course_payments.manage'
  AND r.slug IN ('super_admin', 'owner', 'admin', 'branch_manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;
