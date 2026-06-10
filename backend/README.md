# Maestro Backend

Архитектурный фундамент образовательной платформы Maestro.

**Не трогает frontend** (`../web_app/`).

## Стек

- PostgreSQL 16
- Prisma ORM
- Fastify + TypeScript
- JWT auth
- Clean Architecture

## Быстрый старт

```bash
cp .env.example .env
# заполните ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
docker compose up -d          # PostgreSQL (wait for healthy)
npm install
npm run db:generate
npm run db:migrate            # prisma migrate deploy
npm run db:seed
npm run typecheck
npm run dev
```

Проверка:
```bash
npm run smoke               # requires dev server running
```

API: `http://localhost:4000/api/v1`  
Health: `http://localhost:4000/health`

```bash
npm test   # unit-тесты learning engine
```

### Production seed

`npm run db:seed` идемпотентно синхронизирует роли, permissions, достижения и
первого администратора из `ADMIN_*`. Ученики создаются только через
`POST /auth/register`; учебный контент создается в CMS.

## Документация

- [Stabilization](./docs/STABILIZATION.md)
- [Learning Engine](./docs/LEARNING_ENGINE.md)
- [ERD](./docs/ERD.md)
- [REST API](./docs/API.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Migrations](./docs/MIGRATIONS.md)
- [Scaling & Risks](./docs/SCALING.md)
- [Education CMS](./docs/CMS.md)

## Структура

```text
src/
  domain/           # errors, types
  application/      # repositories, services
  infrastructure/   # prisma client
  presentation/     # routes, auth, middleware
```
