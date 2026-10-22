# Что дальше и как это делать: очередь задач для моделей попроще

Дата: 22.10.2026. Продолжение плана `13-work-plan-2026-10-17.md` и регламента
`14-execution-protocol-2026-10-19.md`. Этот документ — инструкция для модели, которая берёт
одну задачу из очереди, делает её от начала до конца и отчитывается. Он написан так, чтобы
модель не искала контекст сама: где код, какие команды, что считается «сделано».

## 0. Состояние на 22.10

| Что | Где | Состояние |
|---|---|---|
| Этапы 0, 1 (включая 1.14), 3, 2 | ветки `codex/stage0-approve-callback-20261017` платформы и CRM | сделаны, закоммичены, **не запушены** |
| Прод платформы `maestro-school.duckdns.org` | `/health` → `releaseSha` | `5d3c7d4` — без исправления ссылки (`307a204`) и без 1.14 (`2ffd765`) |
| Прод CRM `app-maestro-school.duckdns.org` | `/api/health` | `63aa3d8` — без 1.14 (`d877a84`) |
| GitHub `maestro_school/main` | | `307a204` (исправление ссылки уже там, на сервер не выложено) |
| GitHub `maestro_crm/main` | | `63aa3d8` |
| Этап 4 (курсы для внешних) | 18 вопросов в документе Владислава «Maestro: решения и вопросы 19.10», раздел «Этап 4» | **ответов нет**, код не начинать |

Три рабочих каталога на Mac, все в `/Library/Project/Maestro/MAESTRO/`:

| Каталог | Репозиторий | Ветка | Remote |
|---|---|---|---|
| `maestro-platform-stage0-20261017` | платформа (Fastify + Prisma + Next.js) | `codex/stage0-approve-callback-20261017` | `origin` = `mumitrol16666-creator/maestro_school` |
| `maestro-crm-stage0-20261017` | CRM (Express + Prisma) | `codex/stage0-approve-callback-20261017` | `maestro` = `mumitrol16666-creator/maestro_crm` (не `origin`) |
| `maestro-platform-map-20261017` | документы (эта папка) | `codex/app-map-20261017` | `origin` |

## 1. Правила для любой задачи из очереди

Полные нормы — в документе 14, раздел 1. Самое важное:

1. **Push и прод только после слов Владислава.** Пока он не сказал «пушь» или «выкатывай», всё
   остаётся коммитами в ветке. В отчёте всегда писать «закоммичено, не запушено».
2. **Одна задача — один коммит** (в каждом затронутом репозитории). Сообщение коммита: что и
   почему, на русском или английском, с trailer `Co-Authored-By`.
3. **Деньги только в CRM**, учитель Points не трогает, legacy в V2 не показывается, тексты на
   русском, кнопки от 44 px, телефон 320–430 px без горизонтальной прокрутки.
4. **Ничего не удалять из базы.** Новые колонки с `null`, старые таблицы в архивную схему.
5. **Не задавать вопросы, если ответ есть в документах 13, 14, 15.** Если задача требует решения
   Владислава (помечено ★ ниже), остановиться и спросить до кода.
6. **Отчёт** (первая строка «Да/Нет»): что изменилось для учителя, ученика, родителя, админа; чем
   проверено (цифры тестов); что не сделано; вопросы.

### 1.1 Команды проверки, одни и те же для всех задач

Тесты платформы (бэкенд, с базой):
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017/backend && RUN_DB_INTEGRATION_TESTS=1 DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_platform_stage0_test?schema=public' TEST_DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_platform_stage0_test?schema=public' npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)|^✖"
```
Ожидание: `fail 0`, один пропуск допустим (`skipped 1`).

Типы web:
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017/web_app && npx tsc --noEmit -p tsconfig.json && echo tsc-ok
```

Тесты CRM:
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-crm-stage0-20261017/backend && TEST_DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_ratecards_full_test?schema=public' npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖"
```
Ожидание: `fail 0`.

Перед тестами с базой один раз накатить миграции на тестовую базу:
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017/backend && DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_platform_stage0_test?schema=public' npx prisma migrate deploy
```

### 1.2 QA-контур (нужен для Playwright и ручной проверки)

Если `pg_isready -h localhost -p 5432` отвечает «нет ответа», Postgres выключен (Mac спал):
```bash
LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@15/bin/pg_ctl -D /opt/homebrew/var/postgresql@15 -l /tmp/pg15.log start
```

CRM на 5002 (JWT_SECRET любой длинный, он локальный):
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-crm-stage0-20261017/backend && PORT=5002 NODE_ENV=development TZ=Asia/Aqtobe DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_crm_regression?schema=public' JWT_SECRET=local-maestro-crm-qa-jwt-secret-2026 JWT_EXPIRES_IN=7d FRONTEND_URL=http://127.0.0.1:8081 INTEGRATION_SERVICE_SECRET=local-maestro-integration-secret LEARNING_PLATFORM_API_URL=http://127.0.0.1:4001 MAESTRO_QA_LOCAL=true MAESTRO_QA_DB_MARKER=maestro-crm-regression MAESTRO_QA_CONTROLLER_SECRET=local-maestro-qa-controller-2026 nohup node src/server.js > /tmp/crm-qa.log 2>&1 &
```

Платформа на 4001 (одной строкой, `env -i` обязателен):
```bash
B=/Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017/backend; env -i PATH="$PATH" HOME="$HOME" DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_regression?schema=public' PORT=4001 HOST=127.0.0.1 CRM_API_URL=http://127.0.0.1:5002 INTEGRATION_SERVICE_SECRET=local-maestro-integration-secret INTEGRATION_SSO_SECRET=local-maestro-qa-sso-secret JWT_SECRET=local-maestro-learning-qa-jwt-secret MAESTRO_QA_DB_MARKER=maestro-learning-regression MAESTRO_QA_LOCAL=true PRODUCT_V2_CUTOVER_AT=2026-01-01T00:00:00.000Z FEATURE_CURATOR_WORKSPACE_V2=true FEATURE_HOMEWORK_FLOW_V2=true FEATURE_LEARNING_DIALOGS_V2=true FEATURE_LEARNING_TOPICS_V2=true FEATURE_LESSON_SYNC_V2=true FEATURE_REWARD_ECONOMY_V2=true FEATURE_UNIFIED_LESSON_V2=true CORS_ORIGIN=http://127.0.0.1:3321 UPLOAD_DIR=/tmp/maestro-qa-uploads nohup $B/node_modules/.bin/tsx $B/src/main.ts > /tmp/platform-qa.log 2>&1 &
```

После правок бэкенда платформы: `pkill -f "maestro-platform-stage0-20261017/backend/src/main.ts"` и
запустить снова. После правок CRM: `pkill -f "node src/server.js"` и запустить снова. Миграции на
QA-базу: та же команда `prisma migrate deploy` с `DATABASE_URL=…/maestro_regression`.

Web на 3320: в Claude Code — `preview_start` с именем `maestro-web-qa` (конфиг в
`/Library/Project/Maestro/MAESTRO/.claude/launch.json`). Без Claude Code: `cd web_app && PORT=3320 npm run dev`.

Проверка, что всё живо:
```bash
curl -s -o /dev/null -w "crm %{http_code} " http://127.0.0.1:5002/api/health; curl -s -o /dev/null -w "platform %{http_code} " http://127.0.0.1:4001/health; curl -s -o /dev/null -w "web %{http_code}\n" http://127.0.0.1:3320/login
```

Playwright (через системный Chrome; конфиг `web_app/playwright.chrome.config.ts` есть локально, **в git его не добавлять**):
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017/web_app && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3320 npx playwright test -c playwright.chrome.config.ts e2e/<имя>.spec.ts --project=chromium --workers=1
```
Второй прогон с `--project=mobile-chromium`. Между прогонами пауза 40–70 с: вход ограничен по
частоте (ошибка `Rate limit exceeded` — это не падение теста, подождать и повторить).

Учётные записи QA: пароль `QaMaestro2026!`; платформа `qa_teacher_1`, `qa_teacher_2`,
`qa_student_1`…`qa_student_4`, `qa_parent_1`, `qa_admin` (поле `phone`, `profile: staff|student`);
CRM админ `+77000000001`. QA-урок создаётся через
`POST http://127.0.0.1:5002/api/qa/v1/lessons` с заголовком
`X-Maestro-QA-Secret: local-maestro-qa-controller-2026` (пример — в `e2e/lesson-1-14.spec.ts`).

### 1.3 Что сделать в конце каждой задачи

1. Прогнать всё из 1.1, Playwright-спеку задачи на обоих экранах и соседние спеки
   (список в задаче).
2. Дописать под пунктом в документе 13 строку `**Статус <дата> — сделано**` с тем, что
   изменилось, допущениями и цифрами проверок (образец — статус 1.14).
3. Закоммитить в каждом затронутом репозитории, **без push**.
4. Отчёт Владиславу.

## 2. Очередь задач

Порядок сверху вниз. Задачи B–F независимы друг от друга, их можно давать разным моделям, но
**две модели не правят одни и те же файлы одновременно**.

### A. Выкатка на прод того, что уже сделано ★ (только после «выкатывай» от Владислава)

Что уйдёт: платформа `2ffd765` (1.14 + исправление ссылки `307a204`), CRM `d877a84` (1.14).
Миграция одна: `20261022090000_lesson_text_templates`, данные не трогает. Новых переменных `.env`
нет. `backfill-material-library` уже выполнен 20.10, повторять не нужно (повтор безвреден).

1. Запушить ветки в `main`, строго fast-forward:
   ```bash
   cd /Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017 && git fetch origin main && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:refs/heads/main
   ```
   ```bash
   cd /Library/Project/Maestro/MAESTRO/maestro-crm-stage0-20261017 && git fetch maestro main && git merge-base --is-ancestor maestro/main HEAD && git push maestro HEAD:refs/heads/main
   ```
   Если `merge-base` падает — в `main` есть чужие коммиты, остановиться и спросить.
2. Дождаться зелёного CI в обоих репозиториях (GitHub Actions, workflow `verify`;
   `deploy` остаётся `skipped`, это нормально). Полные SHA: `git rev-parse HEAD` в каждом каталоге.
3. Выкатить одним запуском, подставив полные SHA:
   ```bash
   ssh -p 14579 -o BatchMode=yes -o ServerAliveInterval=30 root@178.105.59.89 'set -euo pipefail; cd /var/www/maestro_crm; git fetch https://github.com/mumitrol16666-creator/maestro_crm.git main; test "$(git rev-parse FETCH_HEAD)" = <CRM_SHA>; git reset --hard <CRM_SHA>; export CRM_RELEASE_SHA_OVERRIDE=<CRM_SHA> LP_RELEASE_SHA_OVERRIDE=<LP_SHA>; bash deploy/deploy-maestro-all.sh all' > /tmp/deploy.log 2>&1; echo "exit=$?"; grep -E "backup verified|No pending|applied|smoke passed|release verified|Done|Error" /tmp/deploy.log
   ```
   Скрипт сам делает дампы баз в `/var/backups/maestro/` и `/var/www/maestro_crm/backups/`,
   применяет миграции, собирает и проверяет health. Выход `exit=0` и строка `Done (all)` — успех.
4. Проверить снаружи:
   ```bash
   curl -s https://maestro-school.duckdns.org/health | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"],d["database"],d["releaseSha"][:7])'; curl -s https://app-maestro-school.duckdns.org/api/health | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"],d["database"],d["releaseSha"][:7])'
   ```
   Оба `ok ok <SHA>`.
5. Откат, если что-то не так: в `/var/www/maestro_school/deploy-state/learning-<SHA>.env` и
   `/var/www/maestro_crm/deploy-state/crm-<SHA>.env` лежат `PREVIOUS_RELEASE_SHA` и `BACKUP_PATH`.
   Выкатить прошлый SHA тем же скриптом; базу восстанавливать только по слову Владислава.
6. Отчёт: SHA до и после, путь к дампам, что проверено. Записать в память модели, что прод обновлён.

### B. Разные секреты интеграции (хвост этапа 0, без UI)

Сейчас обе стороны ходят друг к другу с одним `INTEGRATION_SERVICE_SECRET`: утечка одного
секрета открывает оба направления. Нужно два разных, с запасным вариантом, чтобы выкатка не
требовала одновременной смены на обоих серверах.

Платформа:
1. `backend/src/config/env.ts`: добавить `CRM_OUTBOUND_SECRET: z.string().min(16).optional()`.
2. `backend/src/infrastructure/crm/crm-client.ts` (строка ~15, `const secret = process.env.INTEGRATION_SERVICE_SECRET`):
   брать `process.env.CRM_OUTBOUND_SECRET ?? process.env.INTEGRATION_SERVICE_SECRET`.
   То же в `crm-outbox.service.ts`, `crm-sync.service.ts`, `crm-approval-reconciliation.service.ts`,
   если они формируют заголовок сами (проверить `grep -n INTEGRATION_SERVICE_SECRET`).
3. Входящий guard `presentation/guards/integration.guards.ts` не менять: он проверяет
   `INTEGRATION_SERVICE_SECRET` — это секрет, с которым приходит CRM.
4. `backend/.env.example`: добавить `CRM_OUTBOUND_SECRET=""` с комментарием «равен
   INTEGRATION_SERVICE_SECRET в CRM».
5. Юнит-тест: при заданном `CRM_OUTBOUND_SECRET` заголовок `Authorization` клиента CRM содержит
   его, а не `INTEGRATION_SERVICE_SECRET`; без него — старый.

CRM:
1. Новая переменная `LEARNING_PLATFORM_SECRET`; в шести файлах, где исходящие запросы к
   платформе подписываются `Bearer ${process.env.INTEGRATION_SERVICE_SECRET}`
   (`services/enrollmentAccess.js`, `integrationReconciliation.js`, `integrationJournal.js`,
   `userLink.js`, `sectorExams.js`, и всё, что найдёт `grep -rn "INTEGRATION_SERVICE_SECRET" backend/src`
   кроме `middleware/integrationAuth.js`), вынести в одну функцию
   `learningPlatformSecret()` = `process.env.LEARNING_PLATFORM_SECRET || process.env.INTEGRATION_SERVICE_SECRET`
   (например, в `services/learningPlatformClient.js` или новом `services/learningPlatformAuth.js`).
2. `middleware/integrationAuth.js` не менять: входящие от платформы проверяются по
   `INTEGRATION_SERVICE_SECRET`.
3. `backend/.env.example`: `LEARNING_PLATFORM_SECRET=` с комментарием «равен
   INTEGRATION_SERVICE_SECRET на платформе».
4. Тест: один из клиентов подписывает запрос новым секретом, если он задан.

Проверка: тесты обоих репозиториев; QA-контур с **разными** секретами в двух направлениях
(в командах 1.2 добавить `CRM_OUTBOUND_SECRET=qa-platform-to-crm` платформе и
`LEARNING_PLATFORM_SECRET=qa-crm-to-platform` CRM, а `INTEGRATION_SERVICE_SECRET` у них
соответственно `qa-crm-to-platform` и `qa-platform-to-crm`), затем сквозной сценарий
`scripts/qa-approve-callback-e2e.mjs` (лежит в корне каталога платформы, не в `backend/`) — он ходит в обе стороны.

В отчёте написать для выкатки: на сервере в `.env` платформы добавить `CRM_OUTBOUND_SECRET`
(новое значение), в `.env` CRM поменять `INTEGRATION_SERVICE_SECRET` на то же значение и
добавить `LEARNING_PLATFORM_SECRET` = старое общее значение; порядок: сначала выкатить код с
запасным вариантом, потом менять значения.

### C. Уязвимости зависимостей (`npm audit`)

На 22.10: платформа 5 (`fastify` moderate, `fast-uri`, `deepmerge-ts`, `prisma`,
`@prisma/config` high); CRM 15 (`proxy-addr` critical; `axios`, `follow-redirects`, `multer`,
`mysql2`, `engine.io`, `fast-uri`, `deepmerge-ts`, `prisma`, `@prisma/config` high; `express`,
`body-parser`, `qs`, `morgan`, `hono` moderate). У всех есть исправление.

1. В каждом `backend/`: `npm audit --omit=dev` — записать список до.
2. `npm audit fix` **без** `--force`. Посмотреть `git diff package.json`: если `prisma` или
   `@prisma/client` поднялись на новую мажорную версию (6 → 7), откатить эти две строки
   (`git checkout -- package.json package-lock.json` и повторить `npm audit fix` только для
   остальных через `npm update <пакет>`): смена мажора Prisma — отдельная задача.
3. `npm audit --omit=dev` после: цель — 0 critical и 0 high. Оставшиеся moderate перечислить в отчёте.
4. Тесты обоих репозиториев (1.1), `tsc` web, `npm run build` в `backend/` платформы.
5. На QA-контуре: перезапустить оба API, прогнать `e2e/lesson-1-14.spec.ts` и
   `scripts/qa-approve-callback-e2e.mjs`.
6. Коммит в каждом репозитории: «chore(deps): npm audit fix — <что поднято>».

### D. Материалы в редакторе ступеней программы (хвост 1.12)

У темы шаблона ступени есть поле `materials` в базе (`sector_template_topics.materials`) и в
сервисе (`backend/src/application/services/sector-template.service.ts`, строки 16, 60, 83), но в
админском редакторе `/admin/sector-templates` его нет. С 1.14 урок подсказывает материалы темы
из шаблона — пока они всегда пустые.

1. Тип уже есть: `web_app/src/types/teacher-students.ts:269` — `SectorTemplateTopic.materials`,
   бэкенд отдаёт и принимает поле. Менять только редактор.
2. `web_app/src/app/admin/sector-templates/page.tsx`: в `TopicDraft` добавить `materials`,
   в форме темы — блок «Материалы темы»: `MaterialLibraryPicker` (`@/components/material-library-picker`,
   как в уроке) добавляет `{title, url}` в список, у каждого — кнопка «Убрать» с `aria-label`.
   При сохранении шаблона передавать `materials` в теле (сервис уже принимает).
3. Playwright `e2e/sector-template-materials.spec.ts`: админ `qa_admin` открывает шаблон, добавляет
   материал из библиотеки (создать ссылку через `POST /api/v1/materials/library/links`), сохраняет,
   после перезагрузки материал на месте; затем учитель в уроке ученика, чей сектор открыт из
   этого шаблона, видит кнопку в `lesson-suggested-materials` (можно открыть сектор по шаблону
   прямо из урока — кнопка «Открыть сектор» на шаге «ДЗ и темы», ученик `QA-STUDENT-3`).
4. Соседние спеки: `lesson-1-14`, `materials-library`.

### E. Мелочи 1.14

E1 (без решения). Админ в режиме «за преподавателя» видит старую кнопку «Урок не состоялся»
(`page.tsx`, `canActForTeacher`), а учитель — «Отменить урок». Сделать одинаково: добавить
`POST /admin/offline-lessons/:id/cancel-for-teacher` (сервис `teacherOfflineCancel` с
`appUserId` преподавателя урока, по образцу `notHeldForTeacher` в `admin-offline.routes.ts`), в
`adminOfflineApi.cancelForTeacher`, и в `page.tsx` убрать ветку `mode === "not_held"`. Старый
маршрут `/not-held` оставить для совместимости. Спека: админ `qa_admin` открывает чужой урок,
нажимает «Отменить урок», ученик в CRM `unexcused_absence`.

E2 ★ (нужно решение Владислава). В индивидуальном уроке больше нет отметки «Опоздал»: начатый
урок = «Присутствовал». Если опоздания нужны для статистики — добавить маленький переключатель
«Опоздал» на шаге «Перед уроком». Не делать без ответа.

### F. Гигиена QA-данных

1. `backend/scripts/qa-seed.ts`: перед пересозданием тем удалять проводки
   `points_transactions` и `league_xp_events` с ключами `learning-topic-mastery:%` и
   `learning-plan-completion:%` у QA-учеников — тогда сценарии наград не падают на «delta 0».
2. Там же: создать одну переписку учитель–ученик с двумя сообщениями для `qa_teacher_1` и
   `qa_student_1`, чтобы спека `e2e/learning-dialogs-v2.spec.ts` снова проходила (с 19.10 переписки
   архивируются при синхронизации, и спека падает на пустом списке).
3. Прогнать `qa-seed` на `maestro_regression`, затем `economy:v2:cutover:apply`, затем спеки
   `learning-dialogs-v2`, `group-sector-exam`, `lesson-1-14`.

Команда seed:
```bash
cd /Library/Project/Maestro/MAESTRO/maestro-platform-stage0-20261017/backend && env DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_regression?schema=public' MAESTRO_QA_DB_MARKER=maestro-learning-regression MAESTRO_QA_LOCAL=true npx tsx scripts/qa-seed.ts && env DATABASE_URL='postgresql://vladislav@localhost:5432/maestro_regression?schema=public' npm run economy:v2:cutover:apply
```

### G. Этап 4: курсы для людей вне школы ★ (заблокирован)

Не начинать, пока Владислав не ответит на 18 вопросов в своём документе (раздел «Этап 4:
курсы для людей вне школы — вопросы 20.10»). Когда ответы будут:

1. Сильная модель пишет дизайн этапа в документ 13 под таблицей 4.1–4.8 (данные, маршруты,
   экраны, кто что видит, что в CRM) — по регламенту 14, раздел 2, шаги 1–2.
2. Только после этого задачи раздаются моделям попроще в порядке 4.1 → 4.2 → 4.3 → 4.4 → 4.5 →
   4.7 → 4.8; 4.6 (контент) — не код.
3. Норма этапа: оплата и доступ создаются в CRM, платформа только проверяет право;
   видео за подписанными ссылками; внешний не видит школьных экранов.

## 3. Вопросы Владиславу, которые держат задачи

1. Этап 4 — 18 вопросов в документе (задача G).
2. «Опоздал» в индивидуальном уроке — нужен или нет (задача E2).
3. Выкатка A — только по его слову.
