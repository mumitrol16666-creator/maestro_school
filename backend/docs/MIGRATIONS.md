# Стратегия миграций Maestro

## Инструмент

**Prisma Migrate** — единственный источник DDL.

```bash
# Локальная разработка
npm run db:migrate        # prisma migrate dev

# Production / CI
npm run db:migrate:deploy # prisma migrate deploy
```

## Workflow

1. Изменить `prisma/schema.prisma`
2. `prisma migrate dev --name descriptive_name`
3. Prisma генерирует SQL в `prisma/migrations/<timestamp>_descriptive_name/`
4. Commit migration SQL в git (обязательно)
5. CI: `migrate deploy` перед стартом API

## Правила

| Правило | Причина |
|---------|---------|
| Никогда не редактировать applied migrations | Детерминизм prod/staging |
| Только additive changes в prod | Zero-downtime deploys |
| Destructive changes — двухэтапные | add column → backfill → drop old |
| Seed отдельно от migrate | `prisma db seed` идемпотентен частично |
| `prisma migrate reset` только dev | Удаляет все данные |

## Начальная установка

```bash
cd backend
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Версионирование схемы

- `0.1.x` — foundation (текущий этап)
- `0.2.x` — branch-scoped enrollments, teacher assignments
- `0.3.x` — scheduling module (отдельные таблицы)
- `1.0.x` — payments (отдельный bounded context)

## Rollback

Prisma не поддерживает auto-rollback.

Стратегия:

1. Forward-fix migration (предпочтительно)
2. Ручной down-migration SQL в emergency
3. Backup PostgreSQL перед каждым `migrate deploy` в prod

## Индексы

Все индексы объявлены в `schema.prisma` через `@@index`.

При росте >100k `lesson_progress` rows — рассмотреть партиционирование по `student_id` (PostgreSQL declarative partitioning).
