# Локальный CRM fixture-controller

## Назначение

Controller управляет только детерминированными данными базы `maestro_crm_regression`. Он создаёт источник правды в CRM, после чего Learning Platform читает уроки через существующий integration API и отправляет обратно посещаемость и отчёты через штатный контракт.

Controller не подтверждает отчёт вместо приложения. Проведение выполняется преподавателем в Learning Platform, подтверждение — администратором через существующий экран или API.

Базовый URL: `http://127.0.0.1:5002/api/qa/v1`.

Для каждого запроса нужен заголовок:

```text
X-Maestro-QA-Secret: local-maestro-qa-controller-2026
```

## Статус

```bash
curl -fsS \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  http://127.0.0.1:5002/api/qa/v1/status | jq
```

Ответ обязан содержать:

```json
{
  "database": "maestro_crm_regression",
  "hostname": "db",
  "marker": "maestro-crm-regression"
}
```

## Создать индивидуальный урок

```bash
curl -fsS -X POST \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenarioId": "MANUAL-IND-1",
    "classType": "individual",
    "studentId": "QA-STUDENT-1",
    "teacherId": "QA-TEACHER-1",
    "date": "2026-09-07",
    "startTime": "10:00",
    "endTime": "11:00"
  }' \
  http://127.0.0.1:5002/api/qa/v1/lessons | jq
```

CRM ID будет `QA-RUN-CLASS-MANUAL-IND-1`.

## Создать групповой урок

```bash
curl -fsS -X POST \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenarioId": "MANUAL-GROUP-1",
    "classType": "group",
    "groupId": "QA-GROUP-1",
    "teacherId": "QA-TEACHER-1",
    "date": "2026-09-07",
    "startTime": "18:00",
    "endTime": "19:30"
  }' \
  http://127.0.0.1:5002/api/qa/v1/lessons | jq
```

В roster попадут активные участники группы из CRM.

## Перенести урок

```bash
curl -fsS -X PATCH \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-08","startTime":"17:30","endTime":"19:00"}' \
  http://127.0.0.1:5002/api/qa/v1/lessons/QA-RUN-CLASS-MANUAL-GROUP-1/reschedule | jq
```

Learning Platform получает событие `rescheduled` и при следующем чтении видит новое время CRM.

## Назначить разовую замену

```bash
curl -fsS -X PATCH \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  -H 'Content-Type: application/json' \
  -d '{"teacherId":"QA-TEACHER-2"}' \
  http://127.0.0.1:5002/api/qa/v1/lessons/QA-RUN-CLASS-MANUAL-GROUP-1/substitute | jq
```

Меняется только конкретный урок. Группа, постоянное назначение, история и переписки не передаются замещающему преподавателю.

## Изменить состав группы

```bash
curl -fsS -X PATCH \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  -H 'Content-Type: application/json' \
  -d '{"studentId":"QA-STUDENT-3","state":"left"}' \
  http://127.0.0.1:5002/api/qa/v1/groups/QA-GROUP-1/roster | jq
```

Допустимые состояния: `active` и `left`. Меняются только будущие динамические групповые уроки.

## Отменить урок

```bash
curl -fsS -X POST \
  -H 'X-Maestro-QA-Secret: local-maestro-qa-controller-2026' \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Проверка локальной отмены"}' \
  http://127.0.0.1:5002/api/qa/v1/lessons/QA-RUN-CLASS-MANUAL-IND-1/cancel | jq
```

Урок не удаляется: CRM сохраняет запись со статусом `cancelled`, а Learning Platform получает событие отмены.

## Сбросить динамические сценарии

```bash
cd /Users/vladislav/Documents/Maestro/projects/maestro-learning-platform
./scripts/qa-stack-local.sh reset
```

CRM controller физически удаляет только `QA-RUN-CLASS-*` и восстанавливает базовый roster `QA-GROUP-1`. Отдельный Learning reset удаляет только связанные с тем же префиксом проекции, отчёты, проверки, события синхронизации и начисления в `maestro_regression`. Затем оба QA seed приводят справочники и экономику к известному состоянию.

## Автоматический цикл

```bash
./scripts/qa-stack-local.sh test
```

Каждый запуск автоматически выполняет тот же изолированный сброс и seed, поэтому сценарий предназначен в том числе для повторных regression-прогонов.

Проверяется:

1. Создание урока в CRM и появление у преподавателя.
2. Запуск, посещаемость, завершение и отправка отчёта.
3. Очередь подтверждения администратора.
4. Подтверждение и закрытие урока в CRM.
5. Отмена с сохранением истории.
6. Перенос и новое время в приложении.
7. Удаление/возврат ученика в roster будущего урока.
8. Разовая замена и отсутствие доступа у прежнего преподавателя.
