-- Phone-based login: optional login/email, unique phone_normalized
ALTER TABLE "users" ALTER COLUMN "login" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

DROP INDEX IF EXISTS "users_phone_normalized_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_normalized_key" ON "users"("phone_normalized");
