# 21. Этап 4: курсы для людей вне школы — проект (02.11.2026)

Основа: прод платформы `f1ac08b`, CRM `1f85b02`. Решения Владислава 02.11 — документ 13, этап 4 (4.1–4.10). Проект подготовил maestro-architect, ключевые утверждения сверены с кодом прода.

Пункт трогает деньги (цены, оплаты, возвраты в платформе), награды (Points за модуль и курс) и интеграцию с CRM — перед коммитами нужен maestro-money-reviewer. Норма 1 документа 14 дополнена исключением для денег курсов (решение 02.11).

## 0. Что уже есть и переиспользуется

| Что | Где | Как используется |
|---|---|---|
| Курс → модуль → урок → материалы → тест | `schema.prisma`: `Course`, `CourseModule`, `Lesson`, `LessonMaterial`, `Homework` (`type: test`) | Структура не меняется; у `Course` добавляются цена и признак школы |
| Запись на курс | `StudentCourse`, `services/enrollment.service.ts` | Остаётся «человек начал курс», бесплатно для всех; платный доступ — отдельный слой |
| Открытие уроков по порядку | `domain/lesson-unlock.logic.ts`, `services/lesson-unlock.service.ts` | Без изменений; порядок даёт индекс для правила «первые 2 бесплатно» |
| Плеер урока | `web_app/src/app/(portal)/lessons/[lessonId]/page.tsx` | Добавляется ветка «пейволл» |
| Тест после урока и завершение | `services/homework-submit.service.ts`, `lesson-progress.service.ts` | Гейт доступа перед `requireCourseEnrollment` |
| Points идемпотентно по `sourceKey` | `services/points.service.ts` → `awardSystemPoints` | Как есть |
| Откат Points (`…:reversed:v<n>`) | `services/offline-lesson-reversal.service.ts` → `reversePointsTransaction` | Вынести в `points.service.ts` как `reverseSystemPoints` |
| LEVEL и константы 100/250 | `domain/product-economy-v2.ts` | Переиспользуются |
| Участник экономической эпохи | `economic-epoch.service.ts` → `ensureActiveEconomicEpochParticipant` | Внешнему ничего не нужно |
| Лига только для `leagueEligible` | `weekly-league.service.ts` (12 мест фильтра) | Внешний получает `leagueEligible = false` |
| Уведомления + push | `services/notification.service.ts` | Очередь админа и ответы ученику/родителю |
| Telegram | В платформе нет; в CRM `backend/src/utils/telegram.js` | Платформа получает свой `telegram.service.ts` по образцу |
| Заявка в CRM из приложения | платформа `crm-client.ts` → `postOnlineLessonBooking`; CRM `POST /bookings/online-lesson` → `integrationBooking.js` | Регистрация и «Записаться на пробный» идут этим путём |
| Регистрация через API | `auth.routes.ts` `POST /auth/register` → `syncNewStudentToCrm` создаёт ученика CRM | Вызов убирается, вместо него заявка |
| Страница регистрации | `web_app/src/app/register/page.tsx` — формы нет | Нужна форма |
| Родитель–ребёнок | `ParentStudentLink`, `family.service.ts` (`assertParentChildLink`), `family/page.tsx` | Покупка курса ребёнку |
| Редактор курса | `app/admin/courses/[courseId]/page.tsx`, `cms.routes.ts` | Поля цены и признака |
| Навигация ученика | `student-workspace-navigation.tsx`, `app-shell.tsx` | Второй набор для внешнего |
| Путь «внешний → ученик школы» | CRM `userLink.linkUsers`, платформа `POST /users/link` → `applyUserLink` | Уже есть |

## 1. Как отличают внешнего

Признак один: `users.crm_student_id IS NULL`. Роль остаётся `student`. Без `crmStudentId` ничего не падает: главная отдаёт `schoolStatus: not_linked`, расписание отвечает 400 `CRM_NOT_LINKED`, сектор пустой, лига `not_eligible`, тесты работают. Внешнему школьные разделы скрываются навигацией и редиректом на `/courses`. `GET /auth/me` получает поле `audience: school | external`. Coins за завершение курса в V2 не вызывать.

## 2. Данные

### Платформа, одна миграция `20261103090000_course_access_and_payments`

- `Course`: `priceKzt Int?` (null = курс бесплатный целиком, как все курсы сейчас; платным курс становится, когда админ задал цену — уточнение 02.11, иначе выкатка закрыла бы текущие курсы), `includedInSchool Boolean @default(false)`, `freeLessonsCount Int @default(2)`.
- `CourseAccess`: `studentId`, `courseId`, `source` (`payment | admin_grant`), `paymentRequestId @unique`, `startsAt`, `expiresAt` (+6 мес), `grantedById`, `grantNote`, `revokedAt`, `revokedById`, `revokeReason` (`refund | admin`), `revokeNote`. Доступ ученика школы к курсу с признаком не хранится — вычисляется: `includedInSchool && crmStudentId`.
- `CoursePaymentRequest` («Я оплатил»): `courseId`, `studentId` (кому), `payerUserId` (кто нажал), `amountKzt` (снимок цены), `status` (`pending | confirmed | rejected`), `payerNote`, `decidedById/At`, `decisionNote`, `refundedAt/ById`, `refundNote`. Частичный уникальный индекс `(student_id, course_id) WHERE status='pending'`. Подтверждённая заявка и есть запись в списке оплат (4.10).
- `CoursePaymentSettings` (одна строка): ссылка Kaspi Pay, номер для перевода, получатель, подсказка.
- `UserNotificationType`: `course_payment_requested`, `course_access_granted`, `course_payment_rejected`, `course_access_revoked`.
- Право `course_payments.manage` для `super_admin, owner, admin, branch_manager` — вставкой в миграции и в `seed.ts`.

### CRM, миграций нет

`integrationBooking.js` → `createAppOnlineLessonBooking` принимает `requestType = 'app_registration'`: источник «Приложение — регистрация», направление «Курсы в приложении». `userLink.syncFromApp` не трогать.

## 3. Маршруты

- Домен `domain/course-access.ts`: `lessonIsFree`, `resolveCourseAccess` (`school | paid | granted | none`), `canOpenLesson`. Сервис `course-access.service.ts`: `getCourseAccessState`, `requireLessonAccess` (403 `COURSE_PAYMENT_REQUIRED` в `startLesson`, `completeLessonWithoutHomework`, `submitHomework`), выдача и отзыв.
- Ученик: `GET /courses` и `/courses/:id` с ценой, признаком и доступом; `GET /courses/:id/access`; `GET /lessons/:id` для платного урока без доступа отвечает `access.kind = locked` и пустым контентом; `POST /courses/:id/payment-requests` (409 `PAYMENT_REQUEST_PENDING`, 409 `COURSE_NOT_FOR_SALE`); `GET /students/me/course-payment-requests`; `POST /students/me/trial-requests`.
- Родитель: `GET /parents/me/children/:studentId/courses`, `.../courses/:courseId/access`, `POST .../courses/:courseId/payment-requests` — всё после `assertParentChildLink`.
- Админ (`course_payments.manage`): список и очередь заявок с фильтрами, выгрузка, `confirm` (в транзакции, только из `pending`, создаёт доступ на 6 месяцев), `reject` (с заметкой), `refund` (только `confirmed`, отзывает доступ), доступы ученика, выдача и отзыв доступа админом, реквизиты оплаты. Редактор курса (`catalog.manage`): цена и признак; превью урока «глазами ученика». Все действия в `writeAuditLog`.
- Регистрация: убрать `syncNewStudentToCrm`, ставить `leagueEligible: false`, отправлять заявку `app_registration` в CRM; при недоступной CRM регистрация не падает. `applyUserLink` при установке `crmStudentId` ставит `leagueEligible: true`.

## 4. Экраны

- **Внешний**: меню Курсы / Тесты / Профиль, главная `/courses`, школьные разделы редиректят на `/courses`. Карточки курсов с ценой «… ₸ за 6 месяцев», «Доступ до …» или «Ждём подтверждения оплаты». На платном уроке пейволл: цена, «Оплатить через Kaspi Pay», номер для перевода с кнопкой «Скопировать», комментарий, «Я оплатил»; после нажатия плашка «Заявка отправлена»; при отказе — причина и повтор. Профиль: «Мои курсы» и «Записаться на пробный урок». Регистрация — форма Имя, Фамилия, Телефон, Пароль, без подтверждения телефона.
- **Ученик школы**: всё как сейчас; курс с признаком — «Входит в твоё обучение», все уроки открыты; курс без признака — как у внешнего.
- **Родитель**: карточка «Курсы {ребёнка}» с состоянием и кнопкой «Оплатить курс» → тот же пейволл, на «вы».
- **Админ**: «Оплаты курсов» — вкладки «Ждут проверки» («Подтвердить и открыть», «Оплата не найдена») и «Все оплаты» (фильтры, «Возврат», «Скачать таблицу»); бейдж на меню; редактор курса с ценой, признаком и превью; реквизиты в настройках; в карточке ученика «Доступ к курсам» с выдачей и отзывом. Уведомление в приложении и в Telegram со ссылкой на заявку.

## 5. Деньги и награды

Платформа считает цену, сумму заявки, подтверждение и возврат. CRM не получает ни одной суммы. Points: модуль собран → +100 (`course-module-completion:{moduleId}:{studentId}`), курс собран → +250 (`course-completion:{courseId}:{studentId}`), идемпотентно; Coins в V2 нет. Внешний не получает XP и не попадает в лигу.

## 6. Шаги (по коммиту, без push)

| # | Где | Что | Проверка |
|---|---|---|---|
| 0 | CRM | заявки `app_registration` | тест сервиса, идемпотентность |
| 1 | Платформа | миграция: цена, признак, доступ, заявки, реквизиты, право | `migrate deploy` + `migrate diff` |
| 2 | Платформа | домен доступа и гейт урока, `audience` | юнит и DB-тесты гейта |
| 3 | Платформа | заявки, подтверждение, возврат, выдача, Telegram | DB-тест двойных действий, родителя, срока |
| 4 | Платформа | Points за модуль и курс, без Coins | DB-тест идемпотентности и отката |
| 5 | Платформа | админка: очередь, список, выгрузка, редактор, реквизиты, превью | lint, Playwright |
| 6 | Платформа | кабинет внешнего, пейволл, покупка родителем | Playwright, 320–430 px |
| 7 | Платформа | регистрация создаёт заявку, а не ученика CRM | DB-тест, заявка видна в CRM |
| 8 | Документы | статус 4.1–4.10, память | — |

Выкатка: сначала CRM (шаг 0, обратно совместим), потом платформа. Новые переменные платформы: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (те же, что у CRM), адрес приложения для ссылки.

## 7. Риски денег и доступа

| Риск | Защита |
|---|---|
| Двойное «Я оплатил» | Частичный уникальный индекс, 409, кнопка скрыта при ожидающей заявке |
| Двойное подтверждение | Переход только из `pending` в транзакции; `paymentRequestId @unique` |
| Подтверждение после возврата или отказа | Состояния не пересекаются, 409; новая оплата — новая заявка |
| Истечение доступа | Вычисляется при чтении, закрывать нечего |
| Ученик школы теряет связь с CRM | Бесплатность вычисляется из `crmStudentId`, исчезает и возвращается сама |
| Родитель платит за чужого ребёнка | `assertParentChildLink`, иначе 404 |
| Родитель и ребёнок жмут одновременно | Тот же индекс, вторая заявка 409 |
| Админ без права | `requirePermission("course_payments.manage")` |
| Цена изменилась после заявки | Сумма — снимок в заявке |
| Курс без цены | Открыт целиком бесплатно; заявка на оплату — 409 `COURSE_NOT_FOR_SALE` |
| CRM или Telegram недоступны | Регистрация и уведомление в приложении работают, ошибка в лог |

## 8. Допущения

1. Первые 2 урока — два первых опубликованных урока курса в сквозном порядке.
2. 6 месяцев считаются от подтверждения админом.
3. Повторная покупка при действующем доступе разрешена с предупреждением админу; продления «с конца срока» нет.
4. Возврат всегда полный.
5. +100/+250 одинаково для внешних и учеников школы.
6. Возврат денег не откатывает Points и прогресс.
7. Telegram из платформы напрямую, не через CRM.
8. «Выгрузка в Excel» — CSV (UTF-8 с BOM, разделитель `;`), открывается в Excel; при необходимости `.xlsx` — библиотека на шаге 5.
9. Напоминания об окончании доступа нет.
10. Заявка-лид создаётся на каждую регистрацию; заявка на пробный урок — отдельная.
11. Школьный администратор в платформе — роли `admin`, `owner`, `branch_manager`.
12. Реквизиты одни на школу.
13. Ученик школы, зарегистрировавшийся сам, остаётся внешним до ручной связки админом CRM.
14. В документ 02 добавляется строка «Внешний: Курсы, Тесты, Профиль».

## 9. Решённый вопрос

★1. Кто регистрирует ребёнка. Решение Владислава 02.11 — вариант (а): на `/register` вкладки «Я ученик» и «Я родитель, регистрирую ребёнка». Одна форма родителя создаёт аккаунт родителя, аккаунт ребёнка и связь `ParentStudentLink`, в одной транзакции. Ребёнок входит по своему телефону и паролю, которые задаёт родитель; у ребёнка без телефона вход по телефону родителя невозможен, поэтому телефон ребёнка обязателен и должен отличаться от телефона родителя. Заявка `app_registration` в CRM уходит одна, от родителя, с именем ребёнка в комментарии. Шаг 7.
