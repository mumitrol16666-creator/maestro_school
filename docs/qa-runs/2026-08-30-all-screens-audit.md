# Полный аудит экранов Maestro — 30.08.2026

## Итог

**PASS**

Проверены все 55 экранных модулей Learning Platform в локальной QA-среде.
Критических ошибок загрузки, клиентских исключений и горизонтального вылета
страницы на desktop и телефоне после исправлений не осталось.

## Безопасность прогона

- использовался только `docker-compose.qa.local.yml`;
- web: `http://127.0.0.1:3321`;
- backend: `http://127.0.0.1:4001`;
- PostgreSQL: `127.0.0.1:55435`;
- использовались только аккаунты и записи с префиксом `QA`;
- production API, production database и реальные аккаунты не использовались;
- commit, push и deploy не выполнялись.

## Покрытые экраны

### Публичные — 4

`/`, `/login`, `/register`, `/trial-lesson`.

### Ученик — 18

`/dashboard`, `/learning`, `/monthly-plan`, `/tasks`, `/school-lessons`,
`/online-lessons`, `/messages`, `/progress`, `/league`, `/rewards`, `/courses`,
`/tests`, `/settings`, `/board`, `/courses/[courseId]`, `/tests/[testId]`,
`/lessons/[lessonId]`, `/online-lessons/[requestId]`.

### Родитель — 3

`/family`, `/family/messages`, `/family/settings`.

### Преподаватель и администратор — 30

`/admin`, `/admin/learning`, `/admin/communications`, `/admin/people`,
`/admin/journal`, `/admin/my-students`, `/admin/offline-lessons`,
`/admin/online-lessons`, `/admin/messages`, `/admin/settings`,
`/admin/homework-review`, `/admin/courses`, `/admin/tests`, `/admin/directions`,
`/admin/lesson-questions`, `/admin/media`, `/admin/league`, `/admin/news`,
`/admin/rewards`, `/admin/students`, `/admin/users`,
`/admin/my-students/group/[crmGroupId]/plan`,
`/admin/my-students/student/[crmStudentId]/plan`,
`/admin/offline-lessons/[crmClassId]`, `/admin/online-lessons/[requestId]`,
`/admin/homework-review/[submissionId]`, `/admin/courses/[courseId]`,
`/admin/students/[studentId]`, `/admin/tests/[testId]/preview`,
`/admin/users/[userId]`.

Для динамических маршрутов аудит открывает реальную карточку, если она доступна
в QA-списке. Если записи этого типа нет, проверяется полноценное безопасное
состояние «не найдено». Поэтому исполняется каждый экранный модуль, а не только
страницы со статическим адресом.

## Что проверялось

- отсутствие `Application error`, `client-side exception`, `ChunkLoadError`,
  `TypeError` и необработанных `pageerror`;
- отсутствие HTTP 5xx при открытии страниц;
- отсутствие горизонтального переполнения документа;
- desktop Chromium и мобильный Chromium с профилем Pixel 7;
- вход и ограничения ролей ученика, родителя, преподавателя и администратора;
- переписки, достижение последнего сообщения и работа поля ввода на телефоне;
- ДЗ, отправка, проверка, доработка и переход из уведомления;
- месячный план, задания, расписание и онлайн/очный формат урока;
- LEVEL, постоянные баллы, недельный XP, Coins, лига и награды;
- подтверждение индивидуального и группового урока;
- ожидание отправки в расписание и конфликт данных;
- родительская видимость, семейный кабинет и отдельная переписка;
- восстановление открытой вкладки после установки новой версии приложения.

## Найдено и исправлено

1. Семь сценариев ожидали устаревшие подписи интерфейса и создавали ложные
   падения. Ожидания приведены к актуальному пользовательскому тексту.
2. В журнале обмена урока показывались внутренние значения
   `teacher_attendance`, `failed` и код вида конфликта. Они заменены на
   «Посещаемость от преподавателя», «Не отправлено» и понятное описание причины.
3. Добавлен постоянный `e2e/all-screens-audit.spec.ts`, который автоматически
   проверяет все кабинеты, статические и динамические страницы.
4. В маршрутный аудит добавлены аварийные английские фразы и проверка ширины,
   чтобы возврат уже исправленных проблем останавливал тесты сразу.

## Результаты команд

- `npm run typecheck`: passed;
- production Next.js build в Docker: passed, 45 статических страниц собраны;
- полный Chromium: **58/58 passed**;
- полный mobile Chromium до финальной текстовой правки: **53/53 passed**;
- финальный маршрутный аудит desktop + mobile: **10/10 passed**;
- повторная проверка изменённого обмена урока desktop: **3/3 passed**;
- повторная проверка изменённого обмена урока mobile: **3/3 passed**.

## Текущее состояние

Локальные контейнеры `postgres`, `backend` и `web` работают и имеют статус
`healthy`. Актуальная сборка доступна по `http://127.0.0.1:3321/login` и по
`http://macbook-air-vladislav.local:3321/login` с телефона в той же сети.

Автоматическая проверка подтверждает целостность экранов и основных сценариев,
но не заменяет финальную ручную оценку удобства формулировок и визуальной
иерархии на реальном iPhone. Для ручной приёмки использовать
`docs/qa-runs/2026-08-30-manual-acceptance.md`.
