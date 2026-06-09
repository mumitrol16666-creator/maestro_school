# Maestro Backend Stabilization

Документ фиксирует исправления для запуска backend с реальным frontend.

## Найденные проблемы

### 1. `FST_ERR_HOOK_INVALID_HANDLER`

**Симптом:** Fastify падает при старте или на первом защищённом маршруте.

**Причина:** Маршруты регистрируются во вложенном плагине (`/api/v1`), а `preHandler` использовал `app.authenticate` и `app.requirePermission()` с **дочернего** экземпляра Fastify. Декораторы auth-плагина не пробрасываются в дочерние контексты без `fastify-plugin`, поэтому в `preHandler` попадал `undefined`.

**Исправление:** Вынесены guards в `src/presentation/guards/auth.guards.ts` — обычные функции `authenticate` и `requirePermission`, импортируемые напрямую в route-файлах.

Затронутые файлы:
- `src/presentation/guards/auth.guards.ts` (новый)
- `src/presentation/plugins/auth.plugin.ts`
- `src/presentation/routes/auth.routes.ts`
- `src/presentation/routes/learning.routes.ts`
- `src/presentation/routes/progress.routes.ts`
- `src/presentation/routes/homework.routes.ts`

### 2. Отсутствовала начальная Prisma migration

**Симптом:** `npm run db:migrate` падал на чистой БД — migration `learning_engine` только ALTER-ил несуществующие таблицы.

**Исправление:** Создана полная migration `20250609100000_init` со всей схемой. Частичная `learning_engine` удалена.

### 3. Seed импортировал из `src/`

**Симптом:** Потенциальный сбой `prisma db seed` из-за зависимости seed от application layer.

**Исправление:** Константы вынесены в `prisma/seed-achievements.ts`.

### 4. TypeScript / circular re-export

**Симптом:** Риск ошибок сборки через re-export `computeCourseProgressPercent` из repository.

**Исправление:** `catalog.routes.ts` импортирует `calculateCourseProgressPercent` напрямую из service.

---

## Запуск backend

### 1. PostgreSQL

```bash
cd backend
cp .env.example .env
docker compose up -d
```

Проверка:
```bash
docker compose ps
# STATUS: healthy
```

Параметры (`.env.example`):
| Параметр | Значение |
|----------|----------|
| Host | `localhost` |
| Port | `5432` |
| Database | `maestro` |
| User | `maestro` |
| Password | `maestro` |
| DATABASE_URL | `postgresql://maestro:maestro@localhost:5432/maestro?schema=public` |

### 2. Prisma

```bash
npm install
npm run db:generate
npm run db:migrate      # prisma migrate deploy (non-interactive)
npm run db:seed
```

Для разработки с созданием новых migrations:
```bash
npm run db:migrate:dev
```

### 3. API

```bash
npm run typecheck
npm run build
npm run dev
```

API: `http://localhost:4000`  
Health: `http://localhost:4000/health`

### 4. Frontend

В `web_app/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

---

## Smoke test

Требует запущенный API + seeded БД.

```bash
# terminal 1
npm run dev

# terminal 2
npm run smoke
```

Smoke test выполняет:
1. `GET /health`
2. Login student
3. `GET /students/me/dashboard`
4. `GET /students/me/progress`
5. `GET /courses`, `GET /courses/:id`
6. `GET /directions`, `GET /news`, `GET /lessons/:id`
7. `POST /lessons/:lessonId/start` (lesson 3)
8. `POST /homeworks/:homeworkId/submissions`
9. Login admin
10. `PATCH /homeworks/submissions/:id/review` (approve)
11. Проверка начисления баллов
12. Проверка unlock lesson 4

Seed IDs: `prisma/seed-achievements.ts` → `SEED_IDS`.

Переменная окружения: `SMOKE_BASE_URL` (default `http://localhost:4000`).

---

## Проверенные endpoints

| Endpoint | Auth | Статус |
|----------|------|--------|
| `GET /health` | — | ✓ |
| `POST /api/v1/auth/login` | — | ✓ |
| `GET /api/v1/auth/me` | JWT | ✓ |
| `GET /api/v1/directions` | — | ✓ |
| `GET /api/v1/courses` | — | ✓ |
| `GET /api/v1/courses/:id` | — | ✓ |
| `GET /api/v1/lessons/:id` | — | ✓ |
| `GET /api/v1/news` | — | ✓ |
| `GET /api/v1/students/me/dashboard` | student | ✓ |
| `GET /api/v1/students/me/progress` | student | ✓ |
| `POST /api/v1/lessons/:id/start` | student | ✓ |
| `POST /api/v1/homeworks/:id/submissions` | student | ✓ |
| `PATCH /api/v1/homeworks/submissions/:id/review` | admin | ✓ |

Demo accounts:
- `student@maestro.local` / `student123`
- `admin@maestro.local` / `admin123`

---

## E2E verification (главный сценарий)

См. [E2E_VERIFICATION.md](./E2E_VERIFICATION.md).

```bash
npm run e2e    # admin create → student learn → approve → points → unlock
```

Добавлен `ensureStudentEnrolled()` — auto-enroll при первом доступе ученика к опубликованному курсу.

---

## Что НЕ менялось

- Frontend (`web_app/`)
- Learning Engine бизнес-логика
- Prisma schema (структура сущностей)
- Auth / RBAC роли
- Архитектура проекта
