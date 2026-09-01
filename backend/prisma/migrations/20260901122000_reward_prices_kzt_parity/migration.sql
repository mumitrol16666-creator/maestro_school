-- Coin prices use the approved internal 1 Coin ~= 1 KZT reference.
UPDATE "reward_catalog_items"
SET "cost_coins" = 750, "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Выбрать песню для разбора';

UPDATE "reward_catalog_items"
SET "cost_coins" = 500, "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Медиатор нужной толщины';

UPDATE "reward_catalog_items"
SET "cost_coins" = 1500, "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Персональная подборка упражнений';

UPDATE "reward_catalog_items"
SET "cost_coins" = 1000, "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Пак музыкальных наклеек (10 шт)';

UPDATE "reward_catalog_items"
SET "cost_coins" = 2500, "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Видео-разбор сложного фрагмента';

UPDATE "reward_catalog_items"
SET "cost_coins" = 500, "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Кофе или Чай на ресепшене';
