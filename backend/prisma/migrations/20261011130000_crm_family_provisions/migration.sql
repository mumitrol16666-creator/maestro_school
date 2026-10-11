CREATE TABLE "crm_family_provisions" (
 "operation_id" VARCHAR(128) PRIMARY KEY, "fingerprint" VARCHAR(64) NOT NULL,
 "crm_student_id" VARCHAR(64) NOT NULL, "crm_actor_id" VARCHAR(64) NOT NULL,
 "link_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
