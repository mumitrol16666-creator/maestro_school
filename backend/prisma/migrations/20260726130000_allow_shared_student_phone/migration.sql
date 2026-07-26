-- A family may have several independent student accounts on one contact phone.
-- Login and CRM ids remain unique account identifiers.
DROP INDEX IF EXISTS "users_phone_normalized_key";
CREATE INDEX IF NOT EXISTS "users_phone_normalized_idx" ON "users"("phone_normalized");
