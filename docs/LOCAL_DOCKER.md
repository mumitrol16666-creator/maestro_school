# Локальная проверка Maestro в Docker

Локальный контур не использует production-базу и не требует commit/push.

## Запуск

```bash
docker compose -f docker-compose.local.yml up --build -d
```

После успешной проверки healthchecks:

- приложение: http://127.0.0.1:3320
- API: http://127.0.0.1:4000/api/v1
- health API: http://127.0.0.1:4000/health
- PostgreSQL для локальных инструментов: `127.0.0.1:55433`
- локальная CRM: http://127.0.0.1:8080 (API на `127.0.0.1:5001`)

Браузер обращается к API по маршруту `/api/v1` на том же origin. Next.js
проксирует запросы в backend-контейнер, поэтому production CSP остаётся
включённой и во время локальной проверки.

Локальный администратор:

- login: `admin@maestro.local`
- password: `LocalMaestro2026!`

Для CRM-зависимых экранов должен быть запущен локальный контур из
`projects/maestro-crm/docker-compose.local.yml`. Оба backend-контейнера
используют одинаковый тестовый `INTEGRATION_SERVICE_SECRET`; production-секреты
в локальный контур не передаются.

Backend-сервисы работают в часовом поясе `Asia/Aqtobe`, чтобы даты уроков,
обзора дня и недельных периодов совпадали с рабочим часовым поясом школы.

## Проверка product map

Текущие feature flags и cutover доступны в health API. Все новые функции по
умолчанию выключены.

Локальная проверка `DEV-01B` с включённым только контуром тем и планов:

```bash
docker compose -f docker-compose.local.yml \
  -f docker-compose.learning-v2.local.yml \
  up -d --build backend
docker compose -f docker-compose.local.yml \
  -f docker-compose.learning-v2.local.yml \
  exec -T backend npm run e2e:learning-v2
```

Локальная проверка `DEV-03A` с темами, назначениями и попытками ДЗ:

```bash
docker compose -f docker-compose.local.yml \
  -f docker-compose.homework-v2.local.yml \
  up -d --build
docker compose -f docker-compose.local.yml \
  -f docker-compose.homework-v2.local.yml \
  exec -T backend npm run e2e:homework-v2
cd web_app && npx playwright test e2e/homework-v2-responsive.spec.ts
```

E2E разрешён только при `MAESTRO_QA_LOCAL=true` и маркере
`MAESTRO_QA_DB_MARKER=maestro-local-qa`; он удаляет только собственные записи с
префиксом `e2e:homework-v2:`.

Возврат к обычному локальному режиму с выключенным flag:

```bash
docker compose -f docker-compose.local.yml up -d backend
```

Read-only инвентаризация локальной базы:

```bash
docker compose -f docker-compose.local.yml exec -T backend \
  npm run --silent product:inventory
```

Команда выводит JSON без имён, телефонов и других идентифицирующих полей. Она
не создаёт и не изменяет записи.

## Логи и остановка

```bash
docker compose -f docker-compose.local.yml logs -f
docker compose -f docker-compose.local.yml down
```

`down` сохраняет локальную базу и uploads. Полная очистка выполняется только
явной командой `docker compose -f docker-compose.local.yml down -v`.

## Правило подготовки релиза

Изменения собираются и тестируются в этом контуре. Commit, push и production
deploy выполняются только после отдельного подтверждения владельца проекта.
