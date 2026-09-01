# QA CRM lifecycle — 29.08.2026

## Статус

**PASS**

## Изоляция

- CRM QA project: `maestro-crm-qa`.
- CRM QA database: `maestro_crm_regression`.
- Learning QA project: `maestro-learning-qa`.
- Learning QA database: `maestro_regression`.
- Обычные локальные базы после запуска: `maestro_crm` и `maestro`.
- Production URL, dump и импорт production-данных не использовались.
- QA controller без секрета: `403`.
- QA controller в обычной CRM: `404`.
- CRM UI proxy `127.0.0.1:8081` авторизует fixture `QA-ADMIN-1` через QA backend.
- Learning UI proxy `127.0.0.1:3321` авторизует `qa_admin` из QA Learning database.

## Результаты

- Строгие unit-тесты QA guards/controller helpers: **6/6 passed**.
- Остальной backend CRM: **177 passed, 0 failed, 1 skipped**.
- Learning backend typecheck: passed.
- Сквозной CRM lifecycle: **2 последовательных чистых прогона passed**.
- Перед каждым прогоном обе QA-базы очищены только от динамических
  `QA-RUN-CLASS-*` и связанных с ними проекций/отчётов/начислений, затем
  повторно приведены к исходному fixture-состоянию.

Проверенный маршрут:

1. Создание индивидуального урока в CRM.
2. Появление урока в Learning Platform у назначенного преподавателя.
3. Старт, посещаемость, завершение и отчёт преподавателя.
4. Появление отчёта в административной очереди.
5. Подтверждение без списания и статус `completed` в CRM.
6. Отмена будущего урока со статусом `cancelled` без удаления истории.
7. Перенос группового урока и новое время в Learning Platform.
8. Удаление и возврат ученика в roster будущего урока.
9. Разовая замена: урок видит замещающий преподаватель и не видит исходный.

## Последний fixture-набор

- `QA-RUN-CLASS-HELD-18616994` — completed.
- `QA-RUN-CLASS-CANCEL-18616994` — cancelled.
- `QA-RUN-CLASS-MOVE-18616994` — scheduled, rescheduled, `QA-TEACHER-2`.

## Найдено во время запуска

- Healthcheck CRM использовал отсутствующий в slim-образе `wget`; заменён на Node `fetch`.
- Bootstrap admin конфликтовал с `qa_admin`; bootstrap login отделён от QA fixture.
- При активной v2-экономике подтверждение требует активную эпоху; в QA seed добавлен идемпотентный cutover.
- Повторный seed не должен отвязывать стартовый баланс от активной экономической эпохи; связь теперь сохраняется, поэтому повторное подтверждение урока проходит без `ECONOMIC_EPOCH_BALANCE_MISSING`.
- Integration header теста приведён к реальному контракту `learning-platform`.

## Команды

```bash
./scripts/qa-stack-local.sh status
./scripts/qa-stack-local.sh test
./scripts/qa-stack-local.sh reset
```

Commit, push и deploy не выполнялись.
