-- Preserve the reward storefront that was configured through the admin UI.
-- Stock remains unlimited and fulfilment stays manual in this release.
UPDATE "reward_catalog_items"
SET
  "category" = 'lesson',
  "cost_coins" = 20,
  "stock" = NULL,
  "is_active" = TRUE,
  "sort_order" = 10,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Выбрать песню для разбора';

UPDATE "reward_catalog_items"
SET
  "category" = 'accessories',
  "cost_coins" = 10,
  "stock" = NULL,
  "is_active" = TRUE,
  "sort_order" = 20,
  "description" = 'Качественный медиатор нужной вам толщины (0.5 / 0.7 / 1.0 мм) у администратора школы.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Медиатор нужной толщины';

INSERT INTO "reward_catalog_items" (
  "id", "title", "description", "category", "cost_coins", "stock", "is_active", "sort_order"
)
SELECT
  '00000000-0000-4000-8000-000000001004',
  'Медиатор нужной толщины',
  'Качественный медиатор нужной вам толщины (0.5 / 0.7 / 1.0 мм) у администратора школы.',
  'accessories',
  10,
  NULL,
  TRUE,
  20
WHERE NOT EXISTS (
  SELECT 1 FROM "reward_catalog_items" WHERE "title" = 'Медиатор нужной толщины'
);

UPDATE "reward_catalog_items"
SET
  "category" = 'learning',
  "cost_coins" = 30,
  "stock" = NULL,
  "is_active" = FALSE,
  "sort_order" = 30,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Персональная подборка упражнений';

UPDATE "reward_catalog_items"
SET
  "category" = 'merch',
  "cost_coins" = 20,
  "stock" = NULL,
  "is_active" = TRUE,
  "sort_order" = 40,
  "description" = 'Набор из 10 ярких музыкальных стикеров для чехла, инструмента или ноутбука.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Пак музыкальных наклеек (10 шт)';

INSERT INTO "reward_catalog_items" (
  "id", "title", "description", "category", "cost_coins", "stock", "is_active", "sort_order"
)
SELECT
  '00000000-0000-4000-8000-000000001005',
  'Пак музыкальных наклеек (10 шт)',
  'Набор из 10 ярких музыкальных стикеров для чехла, инструмента или ноутбука.',
  'merch',
  20,
  NULL,
  TRUE,
  40
WHERE NOT EXISTS (
  SELECT 1 FROM "reward_catalog_items" WHERE "title" = 'Пак музыкальных наклеек (10 шт)'
);

UPDATE "reward_catalog_items"
SET
  "category" = 'digital',
  "cost_coins" = 50,
  "stock" = NULL,
  "is_active" = FALSE,
  "sort_order" = 50,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Видео-разбор сложного фрагмента';

UPDATE "reward_catalog_items"
SET
  "category" = 'beverage',
  "cost_coins" = 20,
  "stock" = NULL,
  "is_active" = TRUE,
  "sort_order" = 60,
  "description" = 'Свежий кофе или чай в зоне отдыха на ресепшене перед началом занятия.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "title" = 'Кофе или Чай на ресепшене';

INSERT INTO "reward_catalog_items" (
  "id", "title", "description", "category", "cost_coins", "stock", "is_active", "sort_order"
)
SELECT
  '00000000-0000-4000-8000-000000001006',
  'Кофе или Чай на ресепшене',
  'Свежий кофе или чай в зоне отдыха на ресепшене перед началом занятия.',
  'beverage',
  20,
  NULL,
  TRUE,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM "reward_catalog_items" WHERE "title" = 'Кофе или Чай на ресепшене'
);
