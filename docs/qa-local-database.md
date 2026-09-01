# Локальная QA-база Maestro

## Назначение

QA seed создаёт согласованный набор данных в отдельных Docker-базах Learning Platform и CRM. Он не входит в production seed, не очищает обычные данные и работает только при наличии локальных защитных переменных и точных имён regression-баз.

Версия набора: `QA-SEED-V1`.

## Учётные записи Learning Platform

Общий пароль: `QaMaestro2026!`.

В поле входа можно указывать логин или телефон.

| Код | Логин | Телефон | Роль | Состояние |
|---|---|---|---|---|
| `QA-ADMIN-1` | `qa_admin` | `+77000000001` | администратор и куратор | активен |
| `QA-TEACHER-1` | `qa_teacher_1` | `+77000000011` | постоянный преподаватель | активен |
| `QA-TEACHER-2` | `qa_teacher_2` | `+77000000012` | замена/новый преподаватель | активен |
| `QA-STUDENT-1` | `qa_student_1` | `+77000000021` | индивидуально + группа | активен |
| `QA-STUDENT-2` | `qa_student_2` | `+77000000022` | группа, ДЗ выполнено частично | активен |
| `QA-STUDENT-3` | `qa_student_3` | `+77000000023` | группа, пропуск и ДЗ не выполнено | активен |
| `QA-STUDENT-4` | `qa_student_4` | `+77000000024` | архивный ученик | неактивен, вход запрещён |
| `QA-PARENT-1` | `qa_parent_1` | `+77000000031` | первый родитель `QA-STUDENT-1` | активен |
| `QA-PARENT-2` | `qa_parent_2` | `+77000000032` | второй родитель `QA-STUDENT-1` | активен |

## Что создаётся

- связи аккаунтов между приложением и CRM по фиксированным `QA-*` ID;
- направления «Гитара» и «Вокал»;
- индивидуальная связка `QA-STUDENT-1 + QA-TEACHER-1`;
- группа `QA-GROUP-1` из трёх активных учеников;
- завершённый и предстоящий индивидуальные уроки;
- завершённый и предстоящий групповые уроки;
- общее групповое ДЗ и разные результаты трёх учеников;
- опубликованные индивидуальный и групповой планы;
- темы с прогрессом `0%`, `70%`, `99%` и `100%`;
- восемь недель истории XP;
- legacy-баллы для проверки cutover;
- стартовый баланс `200 Coins` у активных учеников;
- два независимых родительских доступа к одному ребёнку.

Для проверки всего интерфейса используется расширенный seed:

```bash
docker compose -f docker-compose.qa.local.yml exec -T backend npm run db:seed:qa:ui
```

Он сначала выполняет основной `db:seed:qa`, затем идемпотентно добавляет записи
административного журнала и диалоги ученика, преподавателя, родителя и куратора.
Все три шага отдельно проверяют `MAESTRO_QA_LOCAL=true` и локальный адрес базы.

## Изоляция

Обычная локальная среда и QA-среда работают параллельно:

| Контур | Обычная локальная среда | Изолированная QA-среда |
|---|---:|---:|
| Learning web | `127.0.0.1:3320` | `127.0.0.1:3321` |
| Learning API | `127.0.0.1:4000` | `127.0.0.1:4001` |
| Learning DB | `maestro` | `maestro_regression` |
| CRM web | `127.0.0.1:8080` | `127.0.0.1:8081` |
| CRM API | `127.0.0.1:5001` | `127.0.0.1:5002` |
| CRM DB | `maestro_crm` | `maestro_crm_regression` |

QA использует отдельные compose-проекты и volumes:

- `maestro-learning-qa_maestro_learning_qa_pg_data`;
- `maestro-learning-qa_maestro_learning_qa_uploads`;
- `maestro-crm-qa_maestro_crm_qa_pg_data`.

Дампы и данные production не импортируются.

## Запуск

```bash
cd /Users/vladislav/Documents/Maestro/projects/maestro-learning-platform
./scripts/qa-stack-local.sh up
```

Команда поднимает обе QA-системы, применяет миграции, создаёт production-safe справочники, запускает оба QA seed и идемпотентно открывает тестовую экономическую эпоху.

По умолчанию QA-контейнеры переиспользуют уже собранные локальные образы под отдельными тегами. Актуальный CRM-код подключается read-only bind mount. Полную пересборку можно запросить явно:

```bash
QA_REBUILD=YES ./scripts/qa-stack-local.sh up
```

Команды управления:

```bash
./scripts/qa-stack-local.sh status
./scripts/qa-stack-local.sh seed
./scripts/qa-stack-local.sh reset
./scripts/qa-stack-local.sh test
./scripts/qa-stack-local.sh down
```

`test` сначала симметрично очищает динамические fixture-данные в обеих QA-базах, заново запускает оба seed и только после этого проводит сквозной цикл CRM → преподаватель → администратор → CRM. Дополнительно он проверяет отмену, перенос, состав группы и разовую замену, поэтому команду можно безопасно повторять подряд.

Команды можно запускать повторно. QA-пользователи, связи, планы и экономика обновляются через `upsert`; пять базовых QA-уроков пересоздаются вместе с посещаемостью. Среди них `QA-CLASS-IND-ONLINE-UPCOMING` — онлайн-урок с тестовой ссылкой подключения; остальные проверяют очные индивидуальные и групповые сценарии. Динамические уроки контроллера имеют префикс `QA-RUN-CLASS-`.

При повторном seed существующий подтверждённый `crmDirectionId` направления не перезаписывается тестовым значением. На чистой базе согласованные `QA-DIRECTION-*` используются как начальные IDs, а после синхронизации приложение сохраняет фактический ID локальной CRM.

После первой сборки весь набор можно обновлять одной командой:

```bash
/Users/vladislav/Documents/Maestro/projects/maestro-learning-platform/scripts/qa-seed-local.sh
```

Полный UI-прогон Learning Platform после расширенного seed:

```bash
cd /Users/vladislav/Documents/Maestro/projects/maestro-learning-platform/web_app
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3321 npx playwright test --project=chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3321 npx playwright test --project=mobile-chromium
```

## Защита

CRM seed и controller требуют одновременно:

- `MAESTRO_QA_LOCAL=true`;
- `NODE_ENV` не равный `production`;
- `MAESTRO_QA_DB_MARKER=maestro-crm-regression`;
- локальный hostname PostgreSQL;
- точное имя базы `maestro_crm_regression`;
- отдельный `X-Maestro-QA-Secret` для controller API.

Learning seed требует marker `maestro-learning-regression`, локальный PostgreSQL и точное имя `maestro_regression`. Production-подобный URL, обычная локальная база или чужой fixture ID приводят к отказу до первой записи.

Контроллер не монтируется в обычной CRM. Без секрета QA-контроллер возвращает `403`, а обычная CRM на том же маршруте — `404`.

Физическое удаление разрешено только для динамических `QA-RUN-CLASS-*` и связанных с ними данных в точных regression-базах: проекций, отчётов, проверок, outbox-событий и начислений. Обычная отмена меняет статус на `cancelled`, сохраняя историю. Удалить QA-volumes можно только явной командой:

```bash
MAESTRO_QA_DESTROY=YES ./scripts/qa-stack-local.sh destroy
```

## Подробности контроллера

Маршруты и примеры команд описаны в `docs/qa-crm-fixture-controller.md`.
