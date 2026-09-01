# Полный локальный регрессионный прогон — 29.08.2026

## Статус

**PASS WITH REMAINING CHAOS GATES**

Основной функциональный контур Learning Platform и его связь с локальной CRM
прошли регрессию. Сценарии, для которых нужен безопасный CRM fixture-controller,
перечислены отдельно и не считаются пройденными.

## Ограничения прогона

- Только локальные Docker-окружения.
- Production API и production database не использовались.
- Commit, push и deploy не выполнялись.
- Пользовательские изменения в dirty worktree не сбрасывались.
- Исходный commit Learning Platform: `44dc2db`.
- Часовой пояс продукта: `Asia/Aqtobe`.

## Изолированная среда

- Создана отдельная БД `maestro_regression`.
- На неё применены 57 миграций, production seed и QA seed.
- Проверены роли `qa_admin`, `qa_student_1`, `qa_parent_1`.
- CRM-запросы семейного E2E направлялись в локальный stub.
- После прогона Learning Platform возвращена на базовый
  `docker-compose.local.yml`.
- Тестовая БД удалена; тестовые эпохи, записи журнала, сообщения, вложения и
  жалобы очищены.

## Backend Learning Platform

- Unit/integration: **145/145 passed**.
- `npm run smoke`: passed.
- Базовый `npm run e2e`: все 6 сценариев passed.
- Parent family: passed.
- Online lessons и CRM sync: passed.
- Learning v2: passed.
- Homework v2: passed.
- Lesson rewards v2: passed.
- Economy cutover v2: passed.
- Weekly league v2: passed.
- Admin journal v2: passed.
- Parent visibility v2: passed.
- Dialog membership, API, moderation и retention: passed.

## Frontend

- TypeScript typecheck: passed.
- Production Next.js build: passed; собрано 44 маршрута.
- Основной пакет cutover-функций: **25/25 desktop** и **25/25 Pixel 7**.
- Активная экономика: **7/7 desktop** и **7/7 Pixel 7**.
- Канонический набор: **64/64 проверок passed**.
- Дополнительный smoke с выключенными feature flags: **2/2 desktop** и
  **2/2 mobile**.
- Повторная проверка проекции направлений CRM: **2/2 desktop** и
  **2/2 mobile**.

## CRM

- `/api/health`: `ok`.
- Backend tests: **177 passed, 0 failed, 1 skipped**.
- Локальный `/api/integration/v1/directions` вернул 7 активных направлений.
- Learning Platform после синхронизации вернула те же 7 направлений, каждое с
  `crmDirectionId`.
- Создание направления из Learning Platform отклоняется с
  `CRM_DIRECTION_SOURCE_OF_TRUTH`: CRM остаётся источником правды.

## Найдено и исправлено

1. Центр уведомлений сам открывал модальное окно при каждом новом входе staff и
   parent. Автооткрытие удалено, ручное открытие через колокольчик сохранено.
2. При включении unified dialogs из админки исчезал очевидный вход в новости.
   В «Коммуникации» добавлены явные переходы «Диалоги» и «Новости школы».
3. `/admin/directions` показывал локальные устаревшие записи вместо точной
   CRM-проекции. Активный v2-маршрут теперь синхронизирует и выдаёт только
   направления CRM; legacy-поведение сохранено при выключенном флаге.
4. Playwright-сценарии конфликтовали из-за общей изменяемой QA-базы. Для этого
   набора установлен один worker, а сценарии черновиков, диалогов, журнала и
   экономики получили явный reset/cleanup.
5. E2E online lessons использовал устаревший контракт входа и не выбирал
   активного преподавателя. Контракт и локальный CRM stub обновлены.
6. Weekly league зависел от фиксированной даты, а lesson rewards оставлял
   временные связи с эпохой. Время сделано относительным, cleanup завершённым.

## Финальное локальное состояние

- Learning Platform `/health`: database `ok`.
- Cutover: `2026-09-06T19:00:00.000Z` — 7 сентября по `Asia/Aqtobe`.
- Все 9 feature flags выключены.
- Новый `/api/v1/learning-dialogs` при выключенном флаге возвращает
  `LEARNING_DIALOGS_V2_DISABLED`.
- Legacy `/api/v1/messages` продолжает отвечать `200`.
- Основная локальная база не очищалась и не заменялась QA-базой.

## Непройденные chaos-gates

Эти пункты остаются в плане и требуют отдельного безопасного локального
fixture-controller с проверкой `MAESTRO_QA_LOCAL=true`:

- реальный outage/timeout CRM, `pending_sync`, восстановление и конфликт версий;
- отмена/перенос урока, разовая и постоянная замена через CRM-события;
- изменение состава группы до и после сохранения группового черновика;
- доставка события до/после финализации недели и идемпотентный Monday snapshot;
- каникулы, пауза абонемента и отмена всех занятий недели для freeze серии;
- граничные MIME/50 MB, malware/quarantine, истечение ссылки и retention blob;
- договор/согласие родителя: новая версия, окончание и отзыв.

До реализации контроллера эти сценарии нельзя выполнять против боевой CRM и
нельзя считать закрытыми косвенными unit-тестами.

## Итог

Текущий локальный функциональный контур стабилен: backend, production build,
desktop/mobile UI, экономика, уроки, родители, диалоги и CRM-проекция проходят.
Следующий безопасный этап — реализовать fixture-controller и закрыть перечисленные
chaos-gates из `docs/product-map/07-local-e2e-acceptance-prompt.md`.
