INSERT INTO "achievements" (
  "id", "code", "title", "description", "criteria_type", "threshold", "is_active", "created_at", "updated_at"
)
VALUES
  (gen_random_uuid(), 'offline_lesson_1', 'Первый урок в школе', 'Посетите первый подтверждённый офлайн-урок', 'offline_lessons_completed_count', 1, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'offline_lessons_10', '10 уроков в школе', 'Посетите 10 подтверждённых офлайн-уроков', 'offline_lessons_completed_count', 10, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'offline_lessons_25', 'Стабильный ритм', 'Посетите 25 подтверждённых офлайн-уроков', 'offline_lessons_completed_count', 25, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'points_300', '300 баллов', 'Наберите 300 учебных баллов', 'points_threshold', 300, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'points_500', '500 баллов', 'Наберите 500 учебных баллов', 'points_threshold', 500, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'homework_3', 'ДЗ без пауз', 'Выполните домашнее задание к трём офлайн-урокам', 'homework_completed_count', 3, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'homework_10', 'Ответственный музыкант', 'Выполните домашнее задание к десяти офлайн-урокам', 'homework_completed_count', 10, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'monthly_plan_1', 'Цель месяца', 'Освойте все темы одного месячного плана', 'monthly_plans_completed_count', 1, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'coins_25', 'Первые 25 Coins', 'Заработайте 25 Maestro Coins', 'coins_earned_threshold', 25, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'coins_100', 'Сотня Maestro Coins', 'Заработайте 100 Maestro Coins', 'coins_earned_threshold', 100, TRUE, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "criteria_type" = EXCLUDED."criteria_type",
  "threshold" = EXCLUDED."threshold",
  "is_active" = TRUE,
  "updated_at" = NOW();
