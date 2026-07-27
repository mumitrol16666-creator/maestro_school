INSERT INTO "roles" (
  "id", "name", "slug", "description", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(),
  'Parent',
  'parent',
  'Read-only family access to linked students',
  NOW(),
  NOW()
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = NOW();

INSERT INTO "permissions" ("id", "code", "description", "created_at")
VALUES (
  gen_random_uuid(),
  'family.read',
  'View family dashboard for linked students',
  NOW()
)
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description";

DELETE FROM "role_permissions"
WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "slug" = 'parent')
  AND "permission_id" <> (SELECT "id" FROM "permissions" WHERE "code" = 'family.read');

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid(), role_record."id", permission_record."id", NOW()
FROM "roles" role_record
CROSS JOIN "permissions" permission_record
WHERE role_record."slug" = 'parent'
  AND permission_record."code" = 'family.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

CREATE TABLE "parent_student_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "parent_user_id" UUID NOT NULL,
  "student_user_id" UUID NOT NULL,
  "relationship" VARCHAR(32) NOT NULL DEFAULT 'guardian',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "parent_student_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parent_student_links_parent_user_id_fkey"
    FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "parent_student_links_student_user_id_fkey"
    FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "parent_student_links_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "parent_student_links_distinct_users_check"
    CHECK ("parent_user_id" <> "student_user_id")
);

CREATE UNIQUE INDEX "parent_student_links_parent_user_id_student_user_id_key"
  ON "parent_student_links"("parent_user_id", "student_user_id");
CREATE INDEX "parent_student_links_parent_user_id_is_active_idx"
  ON "parent_student_links"("parent_user_id", "is_active");
CREATE INDEX "parent_student_links_student_user_id_is_active_idx"
  ON "parent_student_links"("student_user_id", "is_active");
CREATE INDEX "parent_student_links_created_by_id_idx"
  ON "parent_student_links"("created_by_id");
