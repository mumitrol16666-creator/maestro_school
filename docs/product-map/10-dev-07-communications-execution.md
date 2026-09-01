# DEV-07: учебные диалоги и модерация

Статус: `DEV-07A..DEV-07E DONE LOCALLY / RELEASE GATES REMAIN`
Назначение: безопасно заменить общий direct-message mailbox и отдельную очередь вопросов единым контекстным контуром общения
Основание: [01](./01-product-constitution.md), [02](./02-role-screen-map.md), [03](./03-process-event-map.md), [04](./04-technical-change-map.md), [05](./05-development-prompt.md), [07](./07-local-e2e-acceptance-prompt.md)

## 1. Утверждённая граница V1

В первый выпуск входят только:

1. `learning_direction` — ученик и постоянный преподаватель в конкретном направлении.
2. `parent_teacher` — один общий диалог всех активных родителей ребёнка с постоянным преподавателем в конкретном направлении; ребёнок его не видит.
3. `curator` — обращение ученика в единую административную учётную запись с пользовательской подписью «Куратор».
4. `crm_group` — активные ученики CRM-группы, назначенный преподаватель и администратор с правами модерации.

Student-to-student DM, общий школьный чат и доступ разовой замены не входят. Отдельный `curatorId` и персональное назначение обращения отсутствуют; два родителя одного ребёнка не получают раздельные переписки с одним преподавателем и направлением.

## 2. Утверждённое поведение

- ученик и постоянный преподаватель могут начать учебный диалог;
- любой активный родитель и постоянный преподаватель могут первыми написать в общий parent-teacher диалог;
- групповой чат создаётся и синхронизируется системой по CRM-составу;
- постоянная смена преподавателя переводит прежний учебный диалог в read-only, не открывая его новому преподавателю;
- возврат того же преподавателя по тому же направлению возобновляет прежние учебный и parent-teacher диалоги с сохранённой перепиской;
- вопрос по уроку является сообщением учебного диалога с контекстом урока;
- сообщение можно изменить или отозвать в течение 15 минут, исходные версии остаются в curator audit;
- участник может пожаловаться на конкретную версию сообщения;
- администратор может скрыть сообщение с причиной и временно ограничить отправку в конкретной группе;
- пользователь может отключить уведомления диалога, но не блокирует школьного участника;
- разрешены текст, безопасные изображения, видео MP4/MOV/WebM, PDF и аудио: до пяти файлов по 50 MB;
- применяется server-side MIME/signature/hash/quarantine и короткоживущая приватная ссылка;
- участник архивирует диалог только в своём интерфейсе; ручного общего закрытия/переоткрытия нет, состав CRM-группы меняет только CRM;
- текст, версии и аудит хранятся три года после закрытия; blob вложений — двенадцать месяцев, затем остаются метаданные и аудит.

## 3. Инвентаризация текущего кода

| Текущий объект | Что сохраняем | Что не соответствует цели |
|---|---|---|
| `TeacherConversation` | существующую историю сообщений | unique только по student/teacher, нет направления, назначения, статуса и групп |
| `TeacherMessage` | автора, текст, время и read state как миграционный источник | нет версий, отзыва, скрытия, контекста, вложений и per-member read state |
| `/messages` | пользовательские mailbox-паттерны и push-уведомления | разрешены только student/teacher и нет типизированного scope |
| `/admin/messages` | рабочий teacher UI | маршрут исторически находится под `/admin`, но не является кураторской перепиской |
| `LessonQuestion` и `/admin/lesson-questions` | открытые вопросы и lesson context | отдельная одноходовая очередь со статусом вместо диалога |
| `AdminJournalEntry` | общую очередь решений | жалобы и модерация ещё не подключены |

## 4. Пакеты реализации

| Пакет | Результат | Состояние |
|---|---|---|
| `DEV-07A` | новая схема conversation/member/message/version/attachment/report/moderation, доменные ограничения и rollback flag | `DONE LOCALLY` |
| `DEV-07B` | CRM membership projection для направлений, общего parent-teacher scope и групп, curator scope без `curatorId` | `DONE LOCALLY` |
| `DEV-07C` | V2 API, read/unread, отправка, edit/retract и безопасная миграция legacy сообщений/вопросов | `DONE LOCALLY` |
| `DEV-07D` | приватные вложения, жалобы, скрытие, group restriction и общий admin journal | `DONE LOCALLY` |
| `DEV-07E` | единый responsive UI, уведомления, compatibility cleanup и retention jobs | `DONE LOCALLY` |

## 5. Контракт DEV-07A

- новая схема не изменяет и не удаляет `TeacherConversation`, `TeacherMessage` и `LessonQuestion`;
- `FEATURE_LEARNING_DIALOGS_V2=false` оставляет действующие API/UI без изменений;
- conversation имеет стабильный `sourceKey`, тип, статус, CRM-контекст и сроки retention; `parent_teacher` использует один scope на ребёнка, преподавателя и направление;
- membership хранит роль, период участия, mute и текущее ограничение отправки;
- message не перезаписывает текст: каждая редакция является новой неизменяемой version;
- report ссылается на конкретную version;
- moderation action append-only, содержит фактического admin-автора, причину и при необходимости срок;
- групповой unread считается по member cursor, а не по одному общему `readAt` сообщения;
- миграция legacy-данных не входит в 07A и не запускается автоматически.

## 6. Removal manifest

| Объект | Состояние до завершения DEV-07E | Условие удаления |
|---|---|---|
| `TeacherConversation/TeacherMessage` | legacy source, read/write при выключенном flag | V2 migration report без unmapped rows, role E2E и rollback window |
| `LessonQuestion` | legacy source для открытых вопросов | каждый открытый вопрос связан с V2 message и проверен в UI |
| `/messages` legacy contract | compatibility adapter | новый mailbox принят всеми разрешёнными ролями |
| `/admin/lesson-questions` | deep link/redirect во время совместимости | открытая очередь равна нулю после миграции и принят admin journal |

## 7. Локальная приёмка DEV-07A

1. Prisma validation/generate и migration deploy проходят на локальной QA PostgreSQL.
2. Повтор migration deploy не создаёт дубли и сообщает `up to date`.
3. Domain tests подтверждают 15-минутное окно, MIME/размер/количество, read-only/restricted send и retention.
4. Legacy mailbox smoke проходит при выключенном flag.
5. Новые таблицы пусты до явного fixture/migration script.
6. Production, commit, push и production-данные не затрагиваются.

## 8. Фактическая приёмка DEV-07A

Статус на 29 августа 2026 года: `DONE LOCALLY`, без commit, push и production deploy.

- migration `20260830180000_learning_dialogs_v2_core` применена к локальной QA PostgreSQL как 51-я;
- повторный `prisma migrate deploy` сообщает `No pending migrations to apply`;
- Docker Node 22 выполнил Prisma generate и production TypeScript build;
- профильные доменные тесты: `4/4`, полный backend: `143/143`;
- после migration counts новых conversation/member/message/version/attachment/report/moderation таблиц равны нулю;
- legacy counts остались `1` conversation и `1` message, открытых `LessonQuestion` — `0`;
- legacy student mailbox и unread-count возвращают `200`, существующий диалог читается;
- `FEATURE_LEARNING_DIALOGS_V2=false`, поэтому frontend, API и пользовательские данные не переключены.

## 9. Фактическая приёмка DEV-07B

Статус на 29 августа 2026 года: `DONE LOCALLY`, без commit, push и production deploy.

- добавлена идемпотентная projection service для постоянных CRM-назначений по направлению, общего диалога всех активных родителей и CRM-групп;
- только активные связанные local users входят в projection; неоднозначные направления возвращаются в `unmappedDirections`;
- разовая замена не получает membership, а прежний постоянный преподаватель теряет write при исчезновении назначения;
- прежний учебный диалог архивируется read-only, а возврат того же преподавателя по тому же направлению возобновляет этот scope;
- группа синхронизируется по `crmGroupId`; join/leave/write-state фиксируются в append-only `LearningConversationMembershipEvent`;
- Docker build, backend `144/144` и `e2e:learning-dialog-membership-v2` прошли; cleanup подтвердил `0` V2 fixture-строк и legacy `1/1`;
- следующий пакет — `DEV-07E`; UI и legacy mailbox пока не переключаются.

## 10. Фактическая приёмка DEV-07C

Статус на 29 августа 2026 года: `DONE LOCALLY`, без commit, push и production deploy.

- добавлены V2 list/detail/unread/read/send/edit/retract endpoints, idempotency keys и curator conversation start;
- два активных родителя получают один `parent_teacher` conversation ID и общую сохранённую историю; ребёнок не имеет к нему доступа;
- новый постоянный преподаватель не читает старую переписку, а возврат того же преподавателя по направлению возобновляет прежний scope;
- admin модерирует учебные и групповые диалоги, но пишет только в curator scope; посторонние роли получают `403/404`;
- controlled legacy migration поддерживает dry-run, явный apply и повтор без дублей; неоднозначная или отсутствующая цель блокирует запись;
- миграции `20260830210000_learning_dialog_v2_api_idempotency` и `20260830213000_parent_teacher_learning_dialog` применены только к локальной QA PostgreSQL;
- Docker production build, backend `144/144`, membership E2E и API/legacy-migration E2E прошли; после cleanup V2-таблицы, тестовый каталог и `LessonQuestion` пусты, legacy сохранён `1/1`;
- все `55` migration применены, pending migration отсутствуют.

## 11. Фактическая приёмка DEV-07D

Статус на 29 августа 2026 года: `DONE LOCALLY`, без commit, push и production deploy.

- multipart API принимает до пяти изображений/видео MP4-MOV-WebM/PDF/аудио по 50 MB, допускает сообщение только с файлами и сохраняет blobs вне публичного `/media`;
- MIME, сигнатура, размер и SHA-256 проверяются до статуса `clean`; подмена формата, пустой и неподдерживаемый файл отклоняются;
- скачивание требует повторной server-side авторизации по conversation membership; ребёнок не читает общий parent-teacher файл, второй родитель и постоянный преподаватель читают, посторонний преподаватель получает `404`;
- каждое успешное скачивание создаёт audit `read`; скрытое или отозванное вложение недоступно обычному участнику;
- жалоба ссылается на конкретную неизменяемую message version и идемпотентно создаёт открытую complaint-запись общего admin journal;
- admin может скрыть сообщение с причиной, решить/отклонить жалобу и временно ограничить участника только в `crm_group`; ограничение не меняет CRM membership;
- migration `20260830223000_learning_dialog_moderation_files` применена только к локальной QA PostgreSQL как 56-я;
- Docker production build, backend `145/145`, три dialog E2E и admin-journal E2E прошли; cleanup оставил `0` V2/test rows и `0` private fixture files при legacy `1/1`;
- production S3-compatible adapter и malware scanner не проверялись в локальном контуре и остаются обязательным release gate до production cutover.

## 12. Фактическая приёмка DEV-07E

Статус на 29 августа 2026 года: `DONE LOCALLY`, без commit, push и production deploy.

- единый responsive mailbox работает на student, teacher, parent и общей admin-роли; parent использует отдельный маршрут, но одну общую историю всех активных родителей с постоянным преподавателем;
- personal archive и mute хранятся в membership, не закрывают общий scope и не меняют настройки других участников;
- новое сообщение создаёт не более одного `direct_message_received` для каждого разрешённого получателя, muted участник исключается, URL зависит от роли;
- вопрос по уроку сохраняется как обычное V2-сообщение с `lesson` context, legacy admin-страница перенаправляет в новый mailbox при включённом flag;
- complaint, hide, resolve/dismiss и group restrict/unrestrict доступны из admin UI; admin не пишет в учебные, групповые и родительские scope;
- retention job физически удаляет просроченный локальный blob и очищает текст message versions, сохраняя метаданные;
- migration `20260830233000_learning_dialog_member_preferences` применена только локально как 57-я;
- Docker build backend/web, backend `145/145`, четыре dialog E2E и Playwright `5/5` прошли; desktop `1440 × 900` и mobile `390 × 844` проверены без горизонтального переполнения;
- production object storage и malware scanner не подтверждены и остаются release gates; legacy source и rollback сохраняются.
