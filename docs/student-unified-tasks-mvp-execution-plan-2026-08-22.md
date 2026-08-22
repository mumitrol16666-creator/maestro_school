# Maestro Student App — Unified Tasks MVP Execution Plan

Дата подготовки: 22 августа 2026 года

Статус: план реализации, код этапа не изменён

Затрагиваемые проекты:

- `maestro-learning-platform` — единый read API и ученический интерфейс;
- `maestro-crm` — точная связь проверки офлайн-ДЗ с заданием прошлого урока.

## 1. Цель этапа

Создать для ученика одну понятную очередь домашних заданий независимо от того,
где они появились:

- в самостоятельном курсе;
- после офлайн-урока в школе;
- после онлайн-урока с преподавателем.

Ученик не должен помнить, в каком разделе было создано задание. Один экран
должен отвечать на вопросы:

1. Что мне нужно сделать сейчас?
2. Что уже отправлено и ждёт проверки?
3. Что преподаватель вернул на доработку?
4. Что уже выполнено?
5. Откуда пришло задание и куда нажать, чтобы продолжить?

## 2. Входит ли дизайн

В этап входит функциональный дизайн очереди задач:

- отдельный экран `/tasks`;
- компактный блок на главной ученика;
- счётчик заданий, требующих действия;
- фильтры по состоянию и источнику;
- карточки с источником, заданием, сроком, статусом и кнопкой действия;
- loading, empty, partial error и full error;
- корректная работа на телефоне и в PWA.

Не входит полный редизайн главной, курсов, офлайн-раздела или онлайн-уроков.
Существующие экраны сдачи остаются источником выполнения задания; единая
очередь ведёт на них и не копирует три формы сдачи в одном месте.

## 3. Границы MVP

### Входит

- единый backend read model без копирования всех задач в новую таблицу;
- курсовые задания и курсовые тесты;
- опубликованные офлайн-ДЗ из завершённых уроков;
- задания после завершённых онлайн-уроков;
- четыре единых состояния;
- единые counts;
- сортировка по необходимости действия и реальному сроку;
- точная ссылка на существующий экран выполнения;
- изоляция отказа CRM: курсовые и онлайн-ДЗ продолжают загружаться;
- защита от показа чужих заданий;
- P0 regression и production smoke.

### Не входит

- единая форма сдачи для всех трёх источников;
- изменение существующих правил проверки и начисления наград;
- ручное создание произвольной задачи учеником;
- задачи месячного плана;
- упражнения без домашнего задания;
- напоминания нового типа и push-кампания;
- родительский режим;
- дедлайны для курсовых ДЗ, пока их нет в модели курса;
- штрафы за просрочку;
- массовое редактирование задач;
- AI-приоритизация;
- календарь задач;
- админская объединённая очередь проверки;
- постоянная materialized-таблица `UnifiedTask`.

## 4. Подтверждённое исходное состояние

### 4.1 Курсовые ДЗ

Есть:

- `Homework` внутри курсового урока;
- обычное задание и тест;
- `HomeworkSubmission` с несколькими попытками;
- статусы `pending`, `submitted`, `under_review`, `approved`, `rejected`;
- lesson progress;
- сдача и проверка;
- комментарий преподавателя;
- переход на `/lessons/:lessonId`.

Нет:

- student endpoint списка всех курсовых ДЗ;
- срока сдачи в `Homework`;
- единого счётчика задач.

### 4.2 Офлайн-ДЗ

Есть:

- текст `homework` в опубликованном итоге завершённого CRM-урока;
- история офлайн-занятий ученика;
- teacher review прошлого ДЗ со статусами `not_checked`, `completed`, `partial`,
  `not_completed`, `not_assigned`;
- процент выполнения и комментарии о сложностях;
- страница `/school-lessons?tab=homework`.

Проблема:

- review хранится на следующем занятии, потому что именно там преподаватель
  проверяет предыдущее ДЗ;
- обязательная проверка прошлого ДЗ сейчас применяется только к индивидуальному
  уроку, поэтому групповое ДЗ не имеет гарантированного завершения;
- student `offline-summary` пока не возвращает review рядом с исходным ДЗ;
- текущая логика контекста местами связывает занятия по хронологии без
  постоянного `source class id`, что опасно для ученика с несколькими
  направлениями.

Нельзя считать офлайн-ДЗ выполненным по догадке или по тому, что следующее
занятие состоялось.

### 4.3 Онлайн-ДЗ

Есть:

- `OnlineLessonAssignment` после завершённого онлайн-урока;
- точный `dueAt`;
- формат сдачи и материалы;
- submissions;
- статусы `submitted`, `approved`, `approved_with_remarks`, `returned`;
- форма сдачи на `/online-lessons/:requestId`.

Нет:

- отдельного списка только онлайн-ДЗ;
- включения в общую очередь.

## 5. Главные архитектурные решения

### 5.1 Единая задача — read model, а не новая сущность

Не создавать таблицу, дублирующую курсовые, CRM и онлайн-задачи.

Backend при чтении:

1. получает задания каждого источника;
2. преобразует их отдельными adapter-функциями;
3. объединяет;
4. сортирует;
5. считает counts;
6. возвращает единый DTO.

Источники остаются source of truth:

- курс — Learning Platform PostgreSQL;
- онлайн — Learning Platform PostgreSQL;
- офлайн — CRM плюс сохранённая точная связь review с исходным уроком.

Это исключает рассинхронизацию двух копий статуса и не меняет действующие
процессы сдачи.

### 5.2 Отказ одного источника не роняет очередь

Три adapter-запроса выполняются через `Promise.allSettled`.

Если CRM недоступна:

- курсовые и онлайн-задачи возвращаются;
- response имеет `partial: true`;
- `sources.offline.status = "unavailable"`;
- frontend показывает локальное предупреждение;
- весь экран не заменяется общей ошибкой.

Если упал локальный PostgreSQL-запрос, это считается критической ошибкой API.

### 5.3 Не выдумывать отсутствующие данные

- у онлайн-ДЗ можно показывать точный срок;
- у офлайн-ДЗ можно показывать «к следующему занятию», только если найдено
  следующее занятие того же учебного потока;
- у курсового ДЗ `dueAt = null`, пока срок не добавлен в модель курса;
- отсутствие даты не превращается в «просрочено»;
- отсутствие review не превращается в «выполнено».

## 6. Единый доменный контракт

### 6.1 Источники

```ts
type UnifiedTaskSource = "course" | "offline" | "online";
```

Пользовательские подписи:

| Source | Подпись |
|---|---|
| `course` | Курс |
| `offline` | Урок в школе |
| `online` | Онлайн-урок |

### 6.2 Четыре состояния

```ts
type UnifiedTaskStatus =
  | "todo"
  | "waiting_review"
  | "needs_revision"
  | "completed";
```

| Код | Текст | Требует действия ученика |
|---|---|---|
| `todo` | Нужно сделать | Да |
| `waiting_review` | На проверке | Нет |
| `needs_revision` | Нужна доработка | Да |
| `completed` | Выполнено | Нет |

`actionRequired` вычисляется только из статуса:

```text
todo или needs_revision → true
waiting_review или completed → false
```

### 6.3 Идентификаторы

Единый `id` является namespaced string:

```text
course:<homeworkId>
offline:<crmClassId>
online:<assignmentId>
```

Нельзя объединять элементы по совпадению заголовка или текста.

### 6.4 DTO задачи

```ts
type UnifiedTask = {
  id: string;
  source: "course" | "offline" | "online";
  kind: "assignment" | "test";
  title: string;
  descriptionPreview: string;
  status: "todo" | "waiting_review" | "needs_revision" | "completed";
  actionRequired: boolean;
  context: {
    primary: string;
    secondary: string | null;
    teacherName: string | null;
  };
  timing: {
    assignedAt: string | null;
    dueAt: string | null;
    dueKind: "exact" | "next_lesson" | null;
    overdue: boolean;
  };
  result: {
    completionPercent: number | null;
    scorePercent: number | null;
    reviewComment: string | null;
    points: number | null;
    coins: number | null;
  };
  target: {
    href: string;
    actionLabel: string;
  };
  updatedAt: string;
};
```

Правила DTO:

- `descriptionPreview` ограничивается backend до 240 символов без разрыва
  surrogate pair;
- полный текст остаётся на source screen;
- `href` только внутренний путь приложения, без внешнего user input;
- `overdue = true` только для `dueKind = exact`, прошедшего `dueAt` и
  `actionRequired = true`;
- `next_lesson` не называется просрочкой и отображается как учебный ориентир;
- отсутствующие награды не заменяются нулями, а возвращаются `null`;
- internal IDs преподавателя, телефон и финансовые данные не возвращаются.

## 7. Карта статусов каждого источника

### 7.1 Курсовое задание

Источник состояния — latest submission, затем lesson progress как fallback.

| Source state | Unified state |
|---|---|
| нет submission, lesson `in_progress` | `todo` |
| submission `pending` | `waiting_review` |
| submission `submitted` | `waiting_review` |
| submission `under_review` | `waiting_review` |
| submission `rejected` | `needs_revision` |
| submission `approved` | `completed` |
| lesson progress `completed` | `completed` |

Правила включения:

- ученик должен быть зачислен на курс;
- lesson и homework не удалены;
- lesson опубликован;
- обычное закрытое ДЗ нельзя раскрывать через unified API;
- без submission задача появляется только после реального старта урока;
- rejected submission остаётся видимым, даже если lesson снова получил
  `available`;
- completed попадает только в `scope=completed|all`;
- если у урока ошибочно несколько активных homework, adapter использует тот же
  deterministic primary homework, что lesson detail API.

Перед реализацией выполнить read-only аудит уроков с несколькими активными ДЗ.
Нельзя молча показывать задание, которое source screen не умеет открыть.

### 7.2 Онлайн-задание

| Source state | Unified state |
|---|---|
| assignment есть, submissions нет | `todo` |
| latest submission `submitted` | `waiting_review` |
| latest submission `returned` | `needs_revision` |
| latest submission `approved` | `completed` |
| latest submission `approved_with_remarks` | `completed` |

Правила включения:

- request принадлежит authenticated student;
- assignment существует;
- request завершён и задание доступно ученику;
- `dueAt` переносится как `dueKind=exact`;
- `approved_with_remarks` считается выполненным, комментарий остаётся видимым;
- target: `/online-lessons/:requestId`.

### 7.3 Офлайн-задание

| Source review | Unified state |
|---|---|
| review отсутствует или `not_checked` | `todo` |
| `partial` | `needs_revision` |
| `not_completed` | `needs_revision` |
| `completed` | `completed` |
| `not_assigned` | задача исключается |

Правила включения:

- CRM class имеет status `completed`;
- опубликованный `homework` непустой;
- class относится к текущему ученику или его группе;
- отменённые и пробные уроки без реального homework исключаются;
- `partial` переносит реальный completion percent;
- student не может сам поставить выполнено;
- target: `/school-lessons?tab=homework&lesson=<crmClassId>`;
- history ограничивается опубликованным CRM-окном, но active task не должна
  исчезнуть только из-за frontend `.slice(0, 10)`.

Для группового урока действует то же правило честности: task остаётся активной,
пока преподаватель явно не отметил результат. Сам факт следующего занятия не
завершает ДЗ.

## 8. Точная связь офлайн-review с исходным ДЗ

### 8.1 Почему связь обязательна

Преподаватель на уроке N проверяет ДЗ, выданное на уроке N-1. Статус хранится у
посещаемости урока N. Без source id нельзя надёжно понять, какое ДЗ проверено,
особенно если ученик занимается в нескольких группах или направлениях.

### 8.2 Изменения CRM

В CRM attendee/check модели добавить nullable поле:

```text
reviewedHomeworkClassId
```

Оно должно ссылаться на класс, в котором было выдано проверяемое ДЗ.

При сохранении attendance teacher app передаёт:

```json
{
  "homeworkReview": {
    "sourceCrmClassId": "class-from-previous-homework",
    "status": "partial",
    "completionPercent": 60,
    "difficulties": "...",
    "notCompletedReason": null
  }
}
```

CRM backend проверяет:

- source class существует;
- относится к этому ученику или его группе;
- source class завершён;
- source class имеет непустое homework;
- source class расположен раньше текущего занятия;
- преподаватель имеет право работать с текущим занятием.

`offline-summary` должен вернуть рядом с каждым homework:

```json
{
  "homeworkReview": {
    "status": "partial",
    "completionPercent": 60,
    "difficulties": "...",
    "notCompletedReason": null,
    "reviewedAt": "ISO"
  },
  "reviewConfidence": "exact"
}
```

Также добавить в lesson DTO стабильные `crmGroupId` и `crmTeacherId`, чтобы
находить следующее занятие того же учебного потока.

### 8.3 Групповая проверка без перегрузки преподавателя

Если в предыдущем групповом занятии было ДЗ, экран завершения следующего урока
должен показать компактную строку проверки для каждого присутствующего ученика:

- «Выполнено»;
- «Частично» + процент/что осталось;
- «Не выполнено» + причина.

Для скорости разрешена групповая команда «Отметить всем: выполнено», но она
только заполняет строки. Преподаватель видит результат перед сохранением и может
исправить отдельного ученика. Нельзя молча присваивать `completed` всей группе.

Если предыдущее ДЗ существовало, статус `not_checked` блокирует окончательную
сдачу отчёта и для индивидуального, и для группового проведённого урока. Для
отсутствовавшего ученика проверка не требуется и прошлое ДЗ остаётся активным.
Если прошлого ДЗ не было, backend использует `not_assigned`.

Это изменение относится к качеству source data и является обязательной частью
Unified Tasks, а не визуальным расширением CRM.

### 8.4 Изменения Learning Platform shadow check

В `OfflineLessonStudentCheck` добавить nullable:

```text
reviewedHomeworkCrmClassId
```

Local shadow и CRM должны получать одинаковый source id. Если CRM write успешен,
а local shadow write временно неуспешен, teacher action не откатывается, но
ошибка логируется и исправляется повторной синхронизацией. CRM остаётся source of
truth для student offline adapter.

### 8.5 Legacy-данные

Старые reviews без source id нельзя автоматически считать точными.

Разрешён fallback:

- связать review только если найден ровно один подходящий предыдущий homework в
  том же `crmGroupId` или у того же индивидуального преподавателя;
- пометить `reviewConfidence = legacy_derived`;
- при неоднозначности оставить review неизвестным и task в `todo`;
- не показывать ученику технический текст о confidence;
- логировать количество ambiguous legacy items для последующего аудита.

Не выполнять массовое destructive backfill без отчёта dry-run.

## 9. Сроки и время

### Онлайн

- `dueAt` берётся из assignment;
- отображение по timezone ученика, fallback `Asia/Aqtobe`;
- просрочка считается только для `todo` и `needs_revision`.

### Офлайн

- найти ближайший будущий scheduled class с тем же `crmGroupId`;
- для индивидуального урока — с тем же `crmTeacherId` и student;
- вернуть дату как `dueAt`, но `dueKind=next_lesson`;
- UI пишет «К следующему уроку: дата», а не «дедлайн»;
- не применять штраф и не окрашивать как просроченное.

### Курс

- `dueAt=null`, `dueKind=null`;
- UI пишет «Без срока» только на полном экране; в компактной карточке строку
  срока можно не показывать.

Все timestamps хранятся/возвращаются в ISO UTC, форматируются на клиенте.

## 10. Сортировка и counts

### 10.1 Приоритет статусов

1. `needs_revision`;
2. `todo` с точным просроченным сроком;
3. `todo` с ближайшим точным сроком;
4. `todo` к следующему офлайн-уроку;
5. `todo` без срока;
6. `waiting_review`;
7. `completed`.

Внутри одинакового приоритета:

1. `dueAt` по возрастанию, если есть;
2. `updatedAt` по убыванию;
3. `id` по возрастанию как deterministic tie-breaker.

Source не получает искусственный приоритет. Срочное онлайн-ДЗ не должно быть
ниже курсового только из-за типа источника.

### 10.2 Counts

```ts
type UnifiedTaskCounts = {
  totalActive: number;
  actionRequired: number;
  waitingReview: number;
  needsRevision: number;
  completed: number;
  bySource: {
    course: number;
    offline: number;
    online: number;
  };
};
```

Badge в навигации показывает только `actionRequired`, а не все active tasks.

## 11. Backend API

### 11.1 Endpoint

Добавить:

```http
GET /api/v1/students/me/tasks
```

Query:

```text
scope=active|completed|all    default active
source=course|offline|online optional
status=todo|waiting_review|needs_revision|completed optional
limit=1..100                 default 50
```

В MVP cursor pagination не добавляется. Backend всегда применяет server limit и
возвращает `meta.truncated`, если после фильтров элементов больше лимита.
Материализация и cursor рассматриваются только после измерения реального объёма.

Защита:

- `authenticate`;
- `requireStudent`;
- `requirePermission("progress.read")`;
- student id и `crmStudentId` берутся из session user;
- query не принимает чужой student id;
- course/online queries всегда фильтруются по app user id;
- offline CRM request использует только связанный `crmStudentId`.

### 11.2 Response

```json
{
  "data": {
    "items": [],
    "counts": {
      "totalActive": 0,
      "actionRequired": 0,
      "waitingReview": 0,
      "needsRevision": 0,
      "completed": 0,
      "bySource": {
        "course": 0,
        "offline": 0,
        "online": 0
      }
    }
  },
  "meta": {
    "partial": false,
    "truncated": false,
    "sources": {
      "course": { "status": "ok" },
      "offline": { "status": "ok" },
      "online": { "status": "ok" }
    },
    "generatedAt": "ISO"
  }
}
```

`sources.*` может иметь `status=unavailable` и безопасный code. Не возвращать
внутренний stack trace, CRM URL или текст сетевой ошибки.

### 11.3 Файловая структура

Рекомендуемая структура:

```text
backend/src/domain/unified-task.ts
backend/src/application/services/student-tasks.service.ts
backend/src/application/services/task-sources/course-task.adapter.ts
backend/src/application/services/task-sources/offline-task.adapter.ts
backend/src/application/services/task-sources/online-task.adapter.ts
backend/src/presentation/routes/student-tasks.routes.ts
```

Не размещать три больших Prisma/CRM query непосредственно в route-файле.

### 11.4 Производительность

- course tasks — один Prisma query с latest submissions;
- online tasks — один Prisma query с latest submissions;
- не выполнять отдельный query для каждой задачи;
- offline summary — один CRM request;
- counts считать до `limit`;
- full description не возвращать;
- логировать latency каждого adapter отдельно;
- установить timeout CRM adapter, согласованный с текущим CRM client;
- не кэшировать status дольше 30 секунд без отдельного решения.

## 12. Frontend API и типы

Создать отдельные типы:

```text
web_app/src/types/unified-tasks.ts
```

Добавить:

```text
api.studentTasks(filters?)
```

Не собирать три источника во frontend. Сортировка, mapping и counts принадлежат
backend, чтобы PWA, будущий Telegram и другие клиенты видели одинаковую очередь.

## 13. Экран `/tasks`

### 13.1 Заголовок

```text
Задания
Всё, что нужно сделать по курсам и занятиям с преподавателем.
```

### 13.2 Основные вкладки

- «Нужно сделать» — `todo + needs_revision`;
- «На проверке» — `waiting_review`;
- «Выполнено» — `completed`.

Source filters:

- Все;
- Курсы;
- В школе;
- Онлайн.

Фильтры должны обновлять URL query, чтобы back/forward и reload сохраняли
состояние.

### 13.3 Карточка

Карточка показывает:

- source badge;
- status label;
- заголовок;
- максимум две строки preview;
- курс/урок/преподавателя;
- реальный срок или «к следующему уроку»;
- feedback/процент, если он существует;
- одну главную кнопку.

Кнопки:

| Состояние | Текст |
|---|---|
| `todo` course/online | Выполнить |
| `todo` offline | Посмотреть |
| `needs_revision` | Доработать |
| `waiting_review` | Открыть |
| `completed` | Посмотреть результат |

Карточка не содержит форму сдачи. Она открывает существующий source screen.

### 13.4 Deep links

- course: `/lessons/:lessonId`;
- online: `/online-lessons/:requestId`;
- offline: `/school-lessons?tab=homework&lesson=:crmClassId`.

`school-lessons` необходимо научить:

- читать `tab=homework` при первом render;
- находить `lesson`;
- раскрывать нужную карточку;
- прокручивать к ней после загрузки;
- показывать понятную ошибку, если урок вышел из доступного history window.

### 13.5 Partial error

Если один источник недоступен, сверху показывать компактную строку:

```text
Не удалось обновить задания из школы. Курсовые и онлайн-задания показаны.
[Повторить]
```

Нельзя писать «Заданий нет», если response partial и недоступный источник мог
содержать задания.

### 13.6 Empty states

- action empty: «Сейчас всё сделано. Новые задания появятся после уроков»;
- waiting empty: «Нет заданий на проверке»;
- completed empty: «Выполненные задания появятся здесь»;
- source filter empty: назвать выбранный источник.

## 14. Главная и навигация

### 14.1 Главная

Unified Tasks загружается второстепенным запросом через `Promise.allSettled`.

Компактный блок показывает:

- `actionRequired`;
- максимум три первые задачи;
- source/status;
- ближайший реальный срок;
- ссылку «Все задания».

Если `actionRequired=0`, показать короткое положительное состояние без большой
пустой карточки.

### 14.2 Навигация

Добавить student пункт:

```text
Задания
```

Badge показывает `actionRequired` и ограничивается визуальным `99+`.

Существующие разделы «Уроки в школе» и «Онлайн-уроки» остаются. Они содержат
расписание, отчёты, Zoom и другие функции, а не заменяются очередью задач.

### 14.3 Удаление дублирования

- текущий offline homework alert на главной ведёт в `/tasks?source=offline`;
- homework badge убирается из badge раздела «Школа», но report/schedule alerts
  остаются;
- online notification badge остаётся уведомительным, а task badge показывает
  только действие ученика;
- одна и та же задача не отображается двумя крупными блоками на главной.

## 15. Последовательность реализации

### UTM-00. Безопасный baseline

1. Зафиксировать dirty worktree обоих репозиториев.
2. Разделить Foundation, Monthly Plan, teacher/offline и CRM изменения.
3. Синхронизировать актуальный `origin/main` без destructive git-команд.
4. Запустить baseline learning backend/web и CRM backend tests.
5. Выполнить read-only аудит дубликатов курсового homework.

Definition of Done:

- существующая работа не потеряна;
- baseline и реальные source anomalies записаны;
- нет неизвестного конфликта контрактов.

### UTM-01. Единый domain contract

1. Добавить source/status types.
2. Добавить mapper-функции.
3. Добавить timing/overdue rules.
4. Добавить сортировку и counts.
5. Покрыть чистыми unit tests.

Definition of Done:

- все source states имеют явное отображение;
- неизвестный state не превращается в completed;
- сортировка deterministic;
- frontend не пересчитывает бизнес-статусы.

### UTM-02. Course adapter

1. Выбрать доступные student homeworks одним query.
2. Получить latest submission.
3. Не раскрыть locked content.
4. Сопоставить task status.
5. Создать правильный lesson link.
6. Обработать rejected/revision и test result.

Definition of Done:

- все фактически доступные курсовые ДЗ присутствуют;
- locked ДЗ отсутствуют;
- rejected не теряется после изменения lesson progress;
- detail screen открывает то же homework.

### UTM-03. Online adapter

1. Выбрать assignments ученика одним query.
2. Взять latest submission.
3. Перенести dueAt, review и награды.
4. Сопоставить четыре состояния.
5. Создать request detail link.

Definition of Done:

- чужие assignments невозможны;
- returned требует действия;
- submitted не увеличивает action badge;
- approved_with_remarks считается completed.

### UTM-04. Offline source contract

1. Добавить exact source id review в CRM schema и integration contract.
2. Передавать source id из teacher app.
3. Валидировать source class.
4. Расширить `offline-summary` review-данными и stable group/teacher ids.
5. Добавить local shadow field.
6. Добавить быструю проверку прошлого ДЗ для группового урока.
7. Расширить submission policy: существующее ДЗ нельзя оставить `not_checked`
   у присутствующего ученика.
8. Реализовать безопасный legacy fallback и dry-run audit.
9. Покрыть CRM и Learning integration tests.

Definition of Done:

- новая проверка однозначно относится к исходному ДЗ;
- несколько направлений не смешиваются;
- неоднозначный legacy review не выдаётся за точный;
- групповое ДЗ получает реальный student-specific результат;
- существующая сдача офлайн-урока не сломана.

### UTM-05. Aggregation API

1. Добавить три adapters.
2. Выполнить их с изоляцией offline failure.
3. Объединить, отфильтровать, отсортировать.
4. Посчитать counts до limit.
5. Добавить meta sources/partial/truncated.
6. Зарегистрировать route и документировать API.

Definition of Done:

- endpoint отдаёт единый DTO;
- CRM outage даёт partial response;
- counts не зависят от limit;
- query не принимает student id.

### UTM-06. Student tasks screen

1. Добавить типы и API client.
2. Реализовать `/tasks`.
3. Добавить status/source filters.
4. Добавить карточки и source links.
5. Добавить partial/empty/error states.
6. Реализовать offline deep link.
7. Проверить мобильную ширину и доступность.

Definition of Done:

- все три источника различимы;
- ученик видит, что требует действия;
- карточка всегда открывает рабочий source flow;
- фильтры сохраняются после reload.

### UTM-07. Dashboard и navigation

1. Добавить второстепенную загрузку task summary.
2. Добавить компактную очередь top-3.
3. Добавить navigation item и badge.
4. Перенаправить offline homework alert.
5. Убрать двойной счётчик одной задачи.

Definition of Done:

- ошибка tasks не роняет dashboard;
- badge равен actionRequired;
- главная не повторяет один homework дважды.

### UTM-08. Regression и rollout

1. Запустить unit/integration/E2E обоих проектов.
2. Проверить migration на отдельной БД.
3. Проверить CRM timeout и partial response.
4. Выполнить read-only production smoke.
5. Проверить desktop и установленную PWA.
6. Сверить release SHA API/web/deploy.

Definition of Done:

- P0 сценарии зелёные;
- production не содержит fabricated deadlines/statuses;
- task counts стабильны после reload;
- source flows сдачи не регрессировали.

## 16. Обязательные тесты

### Domain unit

- каждый course status mapping;
- каждый online status mapping;
- каждый offline review mapping;
- unknown status безопасно даёт `todo` или source error, но не completed;
- actionRequired rules;
- exact overdue rules;
- next_lesson никогда не получает overdue;
- deterministic sorting;
- counts считаются до limit;
- namespaced ids не конфликтуют;
- description preview sanitization.

### Course integration

- started lesson без submission → todo;
- locked lesson отсутствует;
- submitted → waiting_review;
- under_review → waiting_review;
- rejected → needs_revision;
- approved → completed;
- failed test → needs_revision;
- passed test → completed;
- ученик не видит homework чужого enrollment.

### Online integration

- assignment без submission → todo;
- dueAt переносится без изменения;
- submitted → waiting_review;
- returned → needs_revision;
- approved → completed;
- approved_with_remarks → completed;
- чужой request отсутствует.

### Offline/CRM integration

- пустой homework не создаёт task;
- cancelled class не создаёт task;
- exact source review правильно связывается;
- два направления не смешивают reviews;
- групповая bulk-отметка не перезаписывает вручную исправленного ученика;
- присутствующий ученик с прошлым ДЗ и `not_checked` блокирует завершение
  отчёта;
- отсутствующий ученик не получает автоматический `completed`;
- partial → needs_revision с процентом;
- completed → completed;
- ambiguous legacy review не становится completed;
- CRM outage даёт partial response;
- CRM_NOT_LINKED не скрывает course/online tasks.

### Frontend/E2E

- на экране одновременно есть по одной задаче каждого источника;
- фильтры работают и отражаются в URL;
- action badge считает только todo/needs_revision;
- offline deep link открывает нужное ДЗ;
- course link открывает форму/тест;
- online link открывает assignment;
- submitted task уходит во вкладку «На проверке»;
- completed task уходит во вкладку «Выполнено»;
- partial source error не показывает ложное empty state;
- dashboard работает при падении task API;
- PWA после обновления показывает новый route.

## 17. P0 сценарии приёмки

### P0-1. Три источника в одной очереди

У ученика есть начатое курсовое ДЗ, опубликованное офлайн-ДЗ и online assignment.

Ожидаемо: `/tasks` показывает три карточки с правильными source labels и рабочими
ссылками.

### P0-2. Сдача курсового ДЗ

1. Ученик открывает course task.
2. Отправляет работу.
3. Возвращается в `/tasks`.

Ожидаемо: задача имеет «На проверке» и не входит в action badge.

### P0-3. Доработка онлайн-ДЗ

1. Преподаватель возвращает online submission.
2. Ученик обновляет очередь.

Ожидаемо: задача первая, статус «Нужна доработка», комментарий доступен, кнопка
ведёт на повторную сдачу.

### P0-4. Проверка офлайн-ДЗ

1. Преподаватель на следующем уроке отмечает прошлое ДЗ выполненным.
2. Передаётся exact source class id.
3. Ученик обновляет очередь.

Ожидаемо: именно исходное офлайн-ДЗ становится выполненным; ДЗ другого
направления не меняется.

### P0-5. CRM недоступна

Отключить CRM adapter в тестовом окружении.

Ожидаемо: course/online tasks видны, есть предупреждение об офлайн-источнике,
экран не падает и не пишет, что заданий нет.

### P0-6. Сроки без выдумок

Ожидаемо:

- online task показывает точный dueAt и реальную просрочку;
- offline task пишет «к следующему уроку»;
- course task не получает случайную дату.

### P0-7. Защита

Ученик меняет query/path и пытается получить чужие задачи.

Ожидаемо: API всегда использует session user; чужих данных нет.

## 18. Наблюдаемость

Логировать без текстов заданий:

- latency каждого adapter;
- количество задач по source/status;
- partial responses;
- CRM timeout/error code;
- ambiguous legacy offline reviews;
- truncated responses;
- invalid source state;
- переходы по source link на frontend analytics.

Не логировать homework text, submission comment, review comment, телефон или ФИО.

## 19. Порядок коммитов

Learning Platform:

1. `feat(tasks): add unified task domain contract`
2. `feat(tasks): add course and online task adapters`
3. `feat(tasks): aggregate offline homework safely`
4. `feat(tasks): add student task queue`
5. `feat(tasks): add dashboard summary and navigation badge`
6. `test(tasks): cover unified task sources and resilience`

CRM:

1. `feat(homework): link offline review to source class`
2. `test(homework): cover exact and legacy review mapping`

Не смешивать эти коммиты с Monthly Plan, Foundation, WhatsApp или магазином.

## 20. Production rollout

1. Зафиксировать предыдущие release SHA Learning и CRM.
2. Сделать backup обеих БД.
3. Выполнить dry-run legacy offline audit.
4. Применить CRM и Learning migrations.
5. Сначала развернуть backward-compatible CRM contract.
6. Затем развернуть Learning backend и web.
7. Проверить release fingerprints.
8. Выполнить read-only task smoke существующим тестовым student token.
9. Проверить по одному заданию каждого source без изменения реальных данных.
10. В течение 30 минут следить за partial rate, CRM latency и invalid states.

При откате сначала откатывается Learning UI/API, затем CRM. Nullable source-link
поля можно оставить: они backward-compatible и не требуют destructive rollback.

## 21. Definition of Done

Unified Tasks MVP завершён только если:

- course, offline и online tasks приходят через один student endpoint;
- четыре состояния отображаются одинаково во всех клиентах;
- action badge считает только реальные действия ученика;
- locked course content не раскрывается;
- online dueAt не искажается;
- course deadline не выдумывается;
- offline review связан с source class;
- несколько направлений не смешивают офлайн-статусы;
- отказ CRM даёт partial result, а не полный отказ;
- каждая карточка открывает существующий рабочий flow;
- главная и navigation не дублируют счётчики;
- backend/frontend/CRM tests и E2E зелёные;
- desktop и PWA проверены;
- production SHA подтверждён;
- существующая незавершённая работа в обоих репозиториях сохранена.

## 22. Формат отчёта исполнителя

```text
Unified Tasks MVP: PASS / FAIL
Learning release SHA: <sha>
CRM release SHA: <sha>

UTM-00: PASS / FAIL — факт
UTM-01: PASS / FAIL — факт
UTM-02: PASS / FAIL — факт
UTM-03: PASS / FAIL — факт
UTM-04: PASS / FAIL — факт
UTM-05: PASS / FAIL — факт
UTM-06: PASS / FAIL — факт
UTM-07: PASS / FAIL — факт
UTM-08: PASS / FAIL — факт

Migrations: PASS / FAIL
Learning backend: PASS / FAIL
CRM backend: PASS / FAIL
Frontend: PASS / FAIL
E2E: PASS / FAIL
Production smoke: PASS / FAIL
Desktop/PWA: PASS / FAIL

Partial source limitations:
- <только реальные ограничения>
```
