-- CRM shows an admin the password it set; a change the user makes in the app makes that copy stale.
-- CRM compares this time with its copy before showing it.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_in_app_at" TIMESTAMPTZ(6);
