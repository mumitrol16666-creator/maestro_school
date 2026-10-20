-- Plan 1.7: retire dead parts of the old economy and online requests.
-- The 14 legacy achievements stop being active; earned rows stay as history.
UPDATE "achievements"
SET "is_active" = false, "updated_at" = now()
WHERE "code" IN (
  'first_lesson', 'points_100', 'first_module', 'lessons_10',
  'offline_lesson_1', 'offline_lessons_10', 'offline_lessons_25',
  'points_300', 'points_500', 'homework_3', 'homework_10',
  'monthly_plan_1', 'coins_25', 'coins_100'
);

-- Permissions nothing checks any more: manual coin awards and app-originated online requests.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" IN ('coins.award', 'online_lessons.request'));
DELETE FROM "permissions" WHERE "code" IN ('coins.award', 'online_lessons.request');
