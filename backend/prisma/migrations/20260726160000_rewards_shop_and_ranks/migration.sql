ALTER TYPE "MaestroCoinTransactionType" ADD VALUE IF NOT EXISTS 'spend';
ALTER TYPE "MaestroCoinSourceType" ADD VALUE IF NOT EXISTS 'reward';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'reward_requested';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'reward_status_updated';

CREATE TYPE "RewardRedemptionStatus" AS ENUM ('requested', 'approved', 'fulfilled', 'rejected');

CREATE TABLE "reward_catalog_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(64) NOT NULL DEFAULT 'learning',
  "cost_coins" INTEGER NOT NULL,
  "stock" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_catalog_items_cost_positive" CHECK ("cost_coins" > 0),
  CONSTRAINT "reward_catalog_items_stock_nonnegative" CHECK ("stock" IS NULL OR "stock" >= 0)
);

CREATE TABLE "reward_redemptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "reward_id" UUID NOT NULL,
  "reward_title" VARCHAR(255) NOT NULL,
  "cost_coins" INTEGER NOT NULL,
  "status" "RewardRedemptionStatus" NOT NULL DEFAULT 'requested',
  "student_note" VARCHAR(500),
  "admin_comment" VARCHAR(500),
  "processed_by" UUID,
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_redemptions_cost_positive" CHECK ("cost_coins" > 0),
  CONSTRAINT "reward_redemptions_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reward_redemptions_reward_id_fkey"
    FOREIGN KEY ("reward_id") REFERENCES "reward_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reward_redemptions_processed_by_fkey"
    FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "reward_catalog_items_is_active_sort_order_idx"
  ON "reward_catalog_items"("is_active", "sort_order");
CREATE INDEX "reward_redemptions_student_id_created_at_idx"
  ON "reward_redemptions"("student_id", "created_at");
CREATE INDEX "reward_redemptions_status_created_at_idx"
  ON "reward_redemptions"("status", "created_at");
CREATE INDEX "reward_redemptions_reward_id_idx"
  ON "reward_redemptions"("reward_id");
CREATE INDEX "reward_redemptions_processed_by_idx"
  ON "reward_redemptions"("processed_by");

INSERT INTO "reward_catalog_items" (
  "id", "title", "description", "category", "cost_coins", "stock", "is_active", "sort_order"
) VALUES
  (
    '00000000-0000-4000-8000-000000001001',
    'Выбрать песню для разбора',
    'Предложите песню, которую хотите разобрать вместе с преподавателем на одном из ближайших уроков.',
    'lesson',
    20,
    NULL,
    TRUE,
    10
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    'Персональная подборка упражнений',
    'Преподаватель подготовит короткую подборку упражнений под вашу текущую цель и уровень.',
    'learning',
    30,
    NULL,
    TRUE,
    20
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    'Видео-разбор сложного фрагмента',
    'Получите короткий персональный видео-разбор одного сложного фрагмента или упражнения.',
    'digital',
    50,
    NULL,
    TRUE,
    30
  )
ON CONFLICT ("id") DO NOTHING;
