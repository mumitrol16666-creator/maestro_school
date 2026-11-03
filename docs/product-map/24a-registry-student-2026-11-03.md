# Реестр (приложение к документу 24), сверка 03.11.2026

Реестр составлен целиком: проверены все 124 З- и 46 В- по коду прода 73280dc (`/Library/Project/Maestro/MAESTRO/maestro-platform-prod-73280dc-20261103`) и ветки `codex/student-ux-20261102` (`/Library/Project/Maestro/MAESTRO/maestro-platform-ux-20261102`, 4 коммита после 73280dc: a029023, b31d6fb, 5e84c2b, cd7da8f). Ничего не менял, файлов не создавал. Пункты З-1…106 и В- проверил по проду, а не по старому коду 941d30d: на проде уже stage0 (5.1–5.7), пакеты 1 и 3, f4ec5f0 (пароль → CRM), e8ad172 (экран ДЗ) и 1.15–1.17. Основную проверку сделали 4 параллельных форка по разделам документа 19. З-108…116 и визуальные В- проверял сам; спорные места (З-90, З-83, З-108, З-110, З-112) перепроверил по коду.

Сокращения путей: `b/` = `backend/src/`, `svc/` = `backend/src/application/services/`, `w/` = `web_app/src/`, `wp/` = `web_app/src/app/(portal)/`.

## 1. Сводка

| Статус | З- | В- | Всего номеров |
|---|---|---|---|
| Исправлено на проде | 15 | 9 | 24 |
| Исправлено в ветке student-ux (не выкачено) | 6 | 5 | 11 |
| Устарело | 2 | 0 | 2 |
| Открыто полностью | 86 | 23 | 109 |
| Открыто частично (часть исправлена) | 15 | 9 | 24 |

После склейки дублей открытые номера (133) сведены в 115 строк:
- приоритет 1 — 5 строк;
- приоритет 2 — 60 строк;
- приоритет 3 — 50 строк.

Главное:
- **Деньги и награды.** Все открытые серверные дефекты по наградам (З-39, 41–44, 53, 83) не исправлены ни на проде, ни в student-ux, ни в money-fix.
- **Две невыкаченные ветки трогают те же файлы**, что и почти все группы ниже: stage4 (`codex/stage4-parent-link-hold-20261103`) и student-ux. Stage4 уже закрывает З-7, часть З-5 и З-12 (`trustProxy`) и Coins на курсах.
- **Перед выкаткой student-ux нужно** задать `NEXT_PUBLIC_SCHOOL_WHATSAPP` в `.env` веба до сборки. Без него строка «Забыл пароль? Напиши администратору» будет без кнопки.
- **Проверить вручную:**
  - части З-1, 19, 20 и В-40 (на ней вид iPhone) — на реальном iPhone;
  - З-27 — выкачена ли часть CRM релиза 02.11;
  - З-12 — как на самом деле настроен nginx на проде.

## 2. Открытые пункты

| № | Суть | Область и файлы | Риск | Решение Владислава | Пр. |
|---|---|---|---|---|---|
| З-12 | Лимиты запросов за nginx, вероятно, общие на весь сайт: вход 10 в минуту, заявка на пробный 5 за 15 минут; ошибка 429 по-английски (проверить конфиг прода) | Сервер: `b/main.ts`, `b/presentation/middleware/error-handler.ts`, `deploy/nginx-maestro-school.conf` | вход/безопасность | нет | 1 |
| З-39 | Урок подтвердили после закрытия недели (пн 12:00): XP не идёт в лигу, 50 Coins не начисляются, серия не засчитана и защитить её нельзя, а итог урока показывает «+20 XP» | Лига, итог урока: `svc/weekly-league.service.ts`, `svc/student-lesson-result.service.ts` | деньги/награды | да: засчитать в ту неделю с пересчётом, в текущую или честно писать «не вошло в лигу» | 1 |
| З-42, З-83 | При возврате урока ученику приходит текст для преподавателя «Администратор вернул отчёт на доработку»; баллы, XP и Coins снимаются молча, Coins могут уйти в минус | Уведомления, откат: `svc/notification.service.ts`, `svc/offline-lesson-reversal.service.ts` | деньги/награды | да: текст ученику; что делать с минусом Coins | 1 |
| З-65 | Урок курса пишет «Баллы начислены», а при экономике v2 Points за урок курса не начисляются | Курсы: `w/lib/homework-ui.ts`, `w/components/homework-test-result.tsx`, `svc/lesson-progress.service.ts` | деньги/награды | да: тексты под stage4 (Points за модуль и курс) | 1 |
| З-90 (ч.) | История занятий: запасная строка «+N учебных баллов» берётся из неначисленных `lessonPoints` («итого» уже честное) | Расписание: `wp/school-lessons/page.tsx` | деньги/награды | нет | 1 |
| З-9 (ч.) | Создание ученика из CRM принимает пароль от 4 символов, а вход требует 8 (update-password уже 8) | Интеграция: `b/presentation/routes/integration.routes.ts` | вход | нет | 2 |
| З-11 | Телефон из CRM с 8 в начале хранится как есть, а при входе 8 меняется на 7, и номер не находится | Вход: `b/application/repositories/auth.repository.ts`, `svc/student-provision.service.ts`, `b/lib/phone.ts` + правка сохранённых номеров | вход, данные | нет | 2 (1, если входят по телефону) |
| В-24 | «Выйти» срабатывает без вопроса, красным в меню | `w/components/user-menu.tsx`, `wp/settings/page.tsx` | вход | нет | 2 |
| З-23 | Выход не отписывает устройство от пушей ученика | `w/components/auth-provider.tsx`, `w/lib/push-notifications.ts`, `b/presentation/routes/push.routes.ts` | данные | нет | 2 |
| З-2 | «Отключить» уведомления не работает, подписка молча восстанавливается | `w/components/push-notifications-card.tsx`, `w/components/push-notification-prompt.tsx` | — | нет | 2 |
| З-16 | Автоперезагрузка при новой версии теряет набранный текст | `w/components/client-runtime-recovery.tsx`, `w/hooks/use-unsaved-changes.ts` | данные | нет | 2 |
| З-5 | После заявки на пробный — тупик «Зарегистрироваться»; имя, фамилия и телефон в адресе (в stage4 форма есть, данные по-прежнему в адресе) | `w/app/trial-lesson/page.tsx`, `w/app/register/page.tsx` | данные | нет (принято в stage4) | 2 |
| З-7 | Открытая регистрация создаёт ученика и карточку в CRM | `b/presentation/routes/auth.routes.ts` | данные | нет (stage4: лид) | 2 |
| З-17, В-6 | «Все разделы» на телефоне повторяет нижнюю панель | Шапка: `w/components/app-shell.tsx` | — | нет | 2 |
| В-5 | Две полосы вкладок и «Ещё» в «Обучении», путь к тесту — 5 уровней | `w/components/student-workspace-navigation.tsx`, `app-shell.tsx`, `wp/learning/page.tsx` | — | да: убрать верхнюю полосу, «Историю обучения» — в профиль | 2 |
| З-91, В-8 | Число на «Расписании» = итоги + уроки сегодня и завтра: не гаснет, «просмотрено» хранится в браузере, день считается по поясу устройства | `w/lib/student-school-alerts.ts`, `app-shell.tsx` | — | да: что считать на вкладке | 2 |
| В-2 (ч.) | Шапка 80 px, заголовки разделов 36 px с подзаголовками (приветствие главной исправлено в ветке) | `app-shell.tsx`, `wp/learning/page.tsx`, `wp/tasks/page.tsx` | — | нет | 2 |
| В-11 (ч.) | Длинные экраны: полная форма предложений на «Обучении», «Обзор» профиля не свёрнут (история — в З-119) | `w/components/sector-proposals.tsx`, `wp/settings/page.tsx` | — | нет | 2 |
| З-48 (ч.), З-110, В-4 | Пустая главная: пустая «Сегодня» + «Все задания сделаны» + «Пока всё тихо»; «урок не назначен» набран крупнее задания | Главная: `wp/dashboard/page.tsx`, `w/components/student-today-card.tsx` | — | нет | 2 |
| З-108 | Онлайн-урок через 10 минут, а единственная кнопка — «Открыть задание»; подключения на главной нет | `student-today-card.tsx`, `b/domain/student-today.ts` | — | да: вернуть «Подключиться» на главную перед онлайн-уроком (в stage0 убрали намеренно) | 2 |
| В-3 | Лишние кнопки: «Открыть сектор» рядом с «Открыть обучение», кнопка курса, «Позанимался» в виде кнопки (плашки в ветке уже компактные) | `wp/dashboard/page.tsx`, `w/components/practice-checkin.tsx` | — | нет | 2 |
| З-37, З-124, В-33 (ч.) | Кубок «в топ-3!» при 0 XP и без места; причина нуля спрятана под «Подробнее» (виджет лиги с главной убран в ветке) | `wp/league/page.tsx` | деньги/награды | нет | 2 |
| З-38 | Ученики с 0 XP попадают в итог недели с полной фамилией | `svc/weekly-league.service.ts` | данные | нет | 2 |
| З-41 | Откат не пересчитывает подведённую неделю: места, Coins за место и цель остаются | `svc/offline-lesson-reversal.service.ts`, `svc/weekly-league.service.ts` | деньги/награды | да: пересчитывать ли закрытую неделю | 2 |
| З-43 | Отмена подтверждённого урока в CRM награды не снимает (money-fix 3dc6335 этого не закрывает) | `svc/offline-lesson-reversal.service.ts` | деньги/награды | да: снимать ли награды при отмене | 2 |
| З-44 (ч.) | Исключённый из лиги теряет XP, 50 Coins за посещение и серию, а экран пишет «Учебный прогресс продолжает сохраняться» | `svc/weekly-league.service.ts`, `wp/league/page.tsx` | деньги/награды | да: терять ли серию и Coins вне лиги | 2 |
| З-45 | Нигде не сказано, что серию продлевают только посещение и принятое ДЗ; уведомление `achievement_earned` не отправляется | `wp/league/page.tsx`, `svc/achievement.service.ts`, `b/presentation/routes/notifications.routes.ts` | деньги/награды | да: что продлевает серию; слать ли уведомление о медали | 2 |
| З-121 | «итого +N баллов» не включает 250 за закрытый сектор | `wp/school-lessons/page.tsx` | деньги/награды | да: подпись «за урок» или включить сектор | 2 |
| З-63 | Тест, упёршийся в недельный лимит XP, при повторном открытии пишет «Уже учтён» | `wp/tests/[testId]/page.tsx`, `b/presentation/routes/prepared-tests.routes.ts` | деньги/награды | нет | 2 |
| В-32 (ч.) | Нет значков уровней и строки «что даёт уровень», медали — серые замки (полоса до уровня — в ветке) | `w/components/level-summary.tsx`, `wp/settings/page.tsx` (EconomyProfileSummary), `svc/achievement.service.ts` | деньги/награды | да: что даёт каждый уровень; иллюстрации | 2 |
| З-35 (п. 3), З-36 (ч.), З-106, З-107 (ч.) | Coins остались: пуш «Начислено Maestro Coins» с кнопкой «Открыть награды», ведущей на главную; «+N Coins» на курсах; Coins на входе и регистрации; «Maestro Coins: N» в онлайн-заявке (меню, профиль и окно LEVEL исправлены в ветке) | `svc/coins.service.ts`, `w/components/teacher-notification-center.tsx`, `w/components/course-card.tsx`, `wp/courses/[courseId]/page.tsx`, `w/components/auth-hero-panel.tsx`, `w/components/auth-platform-preview.tsx`, `wp/online-lessons/[requestId]/page.tsx` | деньги/награды | нет (решение 24.10) | 2 |
| З-54, З-55 | ДЗ на 0 % лежит во «Выполнено» с зелёной меткой; на странице — «Не выполнено · Не выполнено» | `svc/task-sources/school-task.adapter.ts`, `w/lib/task-presentation.ts`, `w/components/learning-homework-card.tsx` | данные | нет | 2 |
| З-56 | На странице ДЗ нет срока, а плашка пишет «Отправлять ничего не нужно» | `learning-homework-card.tsx` | — | нет | 2 |
| З-57 | Ученик без связи со школой всегда видит «Не всё удалось загрузить», «Часть заданий недоступна» и «≥» | `school-task.adapter.ts`, `svc/student-tasks.service.ts` | данные | нет | 2 (1 после stage4) |
| З-118 | Свежее ДЗ «Без темы» из CRM — без ярлыка статуса и срока | `svc/task-sources/offline-task.adapter.ts`, `task-presentation.ts`, `w/components/unified-task-card.tsx` | — | нет | 2 |
| З-117 | Вкладки «Нужно сделать / На проверке» против ярлыков «К уроку / Проверит на уроке»; «Проверит на уроке: N» считает и курсы | `wp/tasks/page.tsx`, `wp/learning/page.tsx` | — | да: единый словарь статусов (с В-27) | 2 |
| З-66 | Урок с ДЗ-тестом без вопросов — тупик | `wp/lessons/[lessonId]/page.tsx`, `svc/lesson-progress.service.ts`, `b/presentation/routes/cms.routes.ts` | — | нет | 2 |
| З-67 | Доработка после ответа файлом: служебный адрес в поле ссылки, форма не отправляется | `w/components/homework-submission-form.tsx` | — | нет | 2 |
| В-19 | Форма сдачи показана выключенной, пока ДЗ на проверке; три сообщения об одном | `wp/lessons/[lessonId]/page.tsx`, `homework-submission-form.tsx` | — | нет | 2 |
| З-64, В-45 | Кнопки-иконки без подписей: в тестах на телефоне текст скрыт; «Обновить» в расписании; «Написать куратору», шапка диалога, «Пожаловаться» | `wp/tests/page.tsx`, `wp/school-lessons/page.tsx`, `w/components/learning-dialog-mailbox.tsx` | — | нет | 2 |
| З-58 | Ученик только с курсами не может «Задать вопрос преподавателю» | `svc/learning-dialog.service.ts`, `w/components/lesson-end-actions.tsx` | — | да: кто отвечает на вопросы по курсу | 2 |
| З-73 | Предложение ученика с сектором группы не уведомляет ни одного преподавателя | `svc/sector-proposal.service.ts` | — | нет | 2 |
| З-75 | Назначенный экзамен в закрытом секторе группы виден только в «Закрытых секторах» | `svc/group-sector.service.ts`, `svc/learning-plan-v2.service.ts` | — | да: отменять экзамен или показывать в открытых | 2 |
| З-76 | Отмена экзамена и досрочное закрытие сектора проходят без уведомления ученику | `svc/sector-exam.service.ts`, `svc/learning-plan-v2.service.ts` | — | нет | 2 |
| З-77 | Кнопка «Закрытые секторы» меняет верхний итог «X из Y тем» | `b/presentation/routes/school-offline.routes.ts`, `wp/monthly-plan/page.tsx` | данные | нет | 2 |
| З-85 | До урока не видно темы, материалов и задания; ветка «Подключиться / Ссылка появится здесь» мёртвая | `wp/school-lessons/page.tsx`, `w/components/student-lesson-calendar.tsx` | — | да: показывать ли до урока материалы и задание | 2 |
| З-86 (ч.) | «Обновить» не берёт свежие данные из CRM: сервер не принимает `fresh`, кеш 60 с (фронт исправлен) | `school-offline.routes.ts`, `svc/school-offline.service.ts`, `b/infrastructure/crm/crm-client.ts`, `w/lib/api-client.ts` | данные | нет | 2 |
| З-87 | Отмена и перенос урока не сбрасывают кеш расписания | `svc/offline-lesson-reversal.service.ts`, `svc/crm-outbox.service.ts` | данные | нет | 2 |
| З-119, В-11 (история) | «N ждут итогов» считает всю историю, «Показать» раскрывает только 14 дней и сразу все | `wp/school-lessons/page.tsx` | — | нет | 2 |
| В-28 | Даты с заглавными буквами: «Ноябрь 2026 Г.», «Вторник, 3 Ноября» | `student-lesson-calendar.tsx`, `wp/school-lessons/page.tsx` | — | нет | 2 |
| З-82 | Уведомления об отмене и переносе открывают «Прошедшие» | `svc/notification.service.ts` | — | нет | 2 |
| З-92 | Пуш, расписание и диалог не помечают уведомление прочитанным; онлайн-заявка гасит все онлайн-уведомления сразу | `web_app/public/sw.js`, `wp/online-lessons/[requestId]/page.tsx`, `wp/school-lessons/page.tsx`, `learning-dialog-mailbox.tsx` | — | нет | 2 |
| З-99 | В сообщении виден служебный «Контекст: lesson» | `learning-dialog-mailbox.tsx` (общий с сотрудниками и семьёй) | — | нет | 2 |
| З-102 | Ученик не может сам начать диалог с преподавателем; нет «Обновить», список обновляется раз в 25 с | `learning-dialog-mailbox.tsx`, `svc/learning-dialog-membership.service.ts` | — | да: может ли ученик начинать диалог | 2 |
| В-12 | Заголовки 48–60 px (урок курса, сектор, лига, регистрация, пробный), до 12 размеров шрифта на экране | `wp/lessons/[lessonId]/page.tsx`, `wp/monthly-plan/page.tsx`, `wp/league/page.tsx`, `w/app/register/page.tsx`, `w/app/trial-lesson/page.tsx`, `level-summary.tsx` | — | нет | 2 |
| В-16 | Пустые состояния четырёх видов; `EmptyState` высотой 360 px, без картинки и действия | `w/components/data-states.tsx` + экраны | — | нет | 2 |
| В-21 | Кнопки не отвечают на нажатие (у ученика `active:` нет нигде) | `w/app/globals.css`, классы кнопок | — | нет | 2 |
| В-25, З-59 | «LEVEL», «Внутренняя экосистема», XP без пояснения, тест по теории подписан «Онлайн-задание» | `level-summary.tsx`, `w/app/register/page.tsx`, `wp/league/page.tsx`, `w/lib/learning-overview.ts` | — | да: «LEVEL» или «Уровень» | 2 |
| В-27 | «Ты» и «вы» вперемешку, семь слов для задания (включает З-117) | все строки ученика | — | да: «ты» везде, одно слово «задание» | 2 |
| В-29 | Тексты для взрослого: «Диалог готов к общению», «Профиль школы не подключён. Обратитесь к администратору», «Учебные группы пока не подключены», «Посмотрите итог…» | `learning-dialog-mailbox.tsx`, `wp/settings/page.tsx`, `svc/school-offline.service.ts`, `svc/student-home.service.ts`, `svc/sector-proposal.service.ts`, `svc/notification.service.ts` | — | нет (после В-27) | 2 |
| В-34 | Ни одной иллюстрации | новые файлы в `web_app/public` | — | да: заказать 6–8 иллюстраций | 2 |
| В-35 (ч.), З-84 | Цвета статусов в трёх разных таблицах; один статус назван двумя словами («Итоги готовятся» / «На проверке»). Плашки в два тона — в ветке | `w/lib/ui.ts`, `unified-task-card.tsx`, `w/lib/homework-ui.ts`, `student-lesson-calendar.tsx`, `wp/school-lessons/page.tsx` | — | нет | 2 |
| В-36 | Пять видов кнопок, разные радиусы | `globals.css` + экраны | — | нет | 2 |
| В-39 | В манифесте одна иконка 350 КБ; файлы 192, 512 и maskable лежат, но не подключены | `web_app/public/manifest.webmanifest`, `w/app/layout.tsx`, `web_app/public/icons` | — | да: утвердить иконку (в `icons` другая картинка) | 2 |
| В-42 | Логотип 64×64 грузится из PNG на 350 КБ на каждой странице, `wordmark.png` 270 КБ | `w/components/brand.tsx`, `web_app/public/brand` | — | нет | 2 |
| З-3, З-113 | Пуш-приветствие и напоминания — про гитару для всех направлений, «Учитель в четверг спросит» | `b/presentation/routes/push.routes.ts`, `b/domain/practice-phrases.ts`, `svc/practice-reminder-job.service.ts`, `w/components/practice-reminder-card.tsx` | — | да: фразы по направлениям или нейтральные | 3 |
| З-6 | На `/trial-lesson` ничто не ведёт, вход ссылается на внешний `trial.html` | `w/app/login/page.tsx`, `w/app/register/page.tsx` | — | да: какой пробный оставить | 3 |
| З-10 | Пример логина «s_77001234567» не совпадает с реальными | `w/app/login/page.tsx` | — | нет | 3 |
| З-13 | Не та вкладка, отключённый аккаунт и неверный пароль дают одну ошибку | `b/presentation/routes/auth.routes.ts` | вход/безопасность | да: можно ли подсказывать роль | 3 |
| З-15 | Целевая страница теряется при входе (`next`) | `w/components/auth-guard.tsx`, `w/app/login/page.tsx` | — | нет | 3 |
| З-21 | Кнопка «Установить» появляется только после перезагрузки `/settings` | `w/components/pwa-provider.tsx`, `pwa-install-card.tsx` | — | нет | 3 |
| З-22 (ч.) | «Позже» у баннера установки — навсегда (наложение карточек исправлено в ветке) | `pwa-provider.tsx` | — | нет | 3 |
| З-24 | «Обзор»: пустой email, телефон «000…», «Онлайн-курсы» считает направления | `wp/settings/page.tsx` | — | нет | 3 |
| З-25 (ч.) | Профиль при упавшей CRM пишет «группы не подключены» и прячет оплату | `wp/settings/page.tsx` | — | нет | 3 |
| З-26 | «Что видят родители» без привязанного родителя; о решении админа ученику не сообщают | `wp/settings/page.tsx`, `svc/parent-visibility.service.ts` | — | нет | 3 |
| З-30 | Вход по ссылке при таймауте CRM: «Проверьте состояние урока» | `b/infrastructure/crm/crm-client.ts`, `w/app/login/page.tsx` | вход | нет | 3 |
| З-32, З-52 | `?_refresh` в адресе; пробный пуш открывает «Обзор»; карточка идеи: «текущий раздел», пример «про отчёт», кнопка без подсказки длины | `w/components/refresh-app-button.tsx`, `client-runtime-recovery.tsx`, `push.routes.ts`, `w/components/improvement-suggestion-card.tsx` | — | нет | 3 |
| З-109 | «К уроку» стоит над любым первым заданием, даже тестом или курсом | `student-today-card.tsx` | — | нет | 3 |
| З-111 | «Открыть сектор» на плашке ответа ведёт в «Обучение» | `svc/sector-proposal.service.ts` | — | нет | 3 |
| В-14 | Рамка в рамке; «0 / 80 XP» трижды на одной карточке лиги | `student-today-card.tsx`, `practice-checkin.tsx`, `wp/league/page.tsx` | — | нет | 3 |
| В-30 (ч.) | Серия не в общей шапке, нет цели дня (в ветке серия дней — на главной) | `app-shell.tsx`, `student-today-card.tsx` | — | да: нужна ли цель дня | 3 |
| В-38 | Тёмные карточки без правила (курс, профиль, лига, «Обучение») | экраны | — | нет | 3 |
| З-114 | Вечернее «Завтра урок» идёт поверх напоминания за 24 часа; карточка об этом не говорит | `svc/practice-reminder-job.service.ts`, `practice-reminder-card.tsx` | — | да: оставить оба напоминания или одно | 3 |
| З-115 | Сбой чтения CRM: «пора взять гитару» уходит в день урока, «Завтра урок» не уходит | `svc/practice-reminder-job.service.ts` | — | нет | 3 |
| З-116 | Без пушей напоминание видно только в колокольчике, плашкой не показывается | `b/domain/student-today.ts` (STUDENT_BANNER_TYPES) | — | да: показывать ли плашкой | 3 |
| З-40 | Coins, снятые откатом, продолжают считаться в итоге недели | `svc/weekly-league.service.ts` | деньги/награды | нет | 3 |
| З-50 (ч.) | Прошлая неделя до итогов: «текущее место», лента «за текущую неделю» | `wp/league/page.tsx` | — | нет | 3 |
| З-51 | «Принятое ДЗ» в лиге ведёт только на школьные ДЗ | `wp/league/page.tsx` | — | нет | 3 |
| З-53 | Отклонение старой заявки возвращает Coins в новый баланс | `svc/rewards.service.ts` | деньги/награды | да: что делать со старыми заявками (до открытия магазина) | 3 |
| З-18, З-46 (а) | `/board` недоступна из меню, фото основателя нет в сборке | `w/components/student-workspace-navigation.tsx`, `w/components/founder-message.tsx` | — | да: нужна ли доска ученику; фото | 3 |
| З-60 | Проваленный тест — «Повторить тест», после второй неудачи исчезает из заданий | `svc/task-sources/theory-task.adapter.ts` | — | нет | 3 |
| З-62 (ч.) | Если сегодня тест недоступен, кнопка «Следующий урок» ведёт на тест, закрытый до завтра | `wp/tests/[testId]/page.tsx` | — | нет | 3 |
| В-20 | «Ответы сохранены» видно до первого ответа | `wp/tests/[testId]/page.tsx` | — | нет | 3 |
| В-43 (ч.) | Ссылки в старом ДЗ из CRM — голый текст (в ДЗ v2 уже встраиваются) | `w/components/student-school-homework-legacy.tsx` | — | нет | 3 |
| З-68 | Можно отправить пустой ответ на ДЗ курса | `homework-submission-form.tsx`, `b/presentation/routes/homework.routes.ts` | — | нет | 3 |
| З-70 | Каталог считает неопубликованные и удалённые уроки | `b/application/repositories/catalog.repository.ts` | — | нет | 3 |
| З-71 | Статусы ДЗ курса «Проверяется / Проверен» недостижимы | `svc/homework-review.service.ts` | — | да: нужны или удалить | 3 |
| З-81 | «История обучения»: уроки по дате изменения, а не по программе | `b/application/repositories/progress.repository.ts`, `wp/progress/page.tsx` | данные | нет | 3 |
| З-72 (ч.) | Смешанные «Направление не найдено not found», «Урок not found»; сырой текст ошибки в трёх формах | `b/domain/errors.ts`, `svc/sector-proposal.service.ts`, `svc/lesson-share.service.ts`, `learning-dialog-mailbox.tsx`, `learning-homework-card.tsx` | — | нет | 3 |
| З-74 | О публикации сектора группы ученикам не сообщают | `svc/learning-plan-v2.service.ts` | — | нет | 3 |
| З-78, З-123 | Перенесённая и убранная тема подписаны «Заменена» | `wp/monthly-plan/page.tsx` | — | нет | 3 |
| З-88 (ч.) | Кеш CRM живёт в памяти процесса и пропадает при перезапуске | `b/infrastructure/crm/crm-cache.ts` | данные | нет | 3 |
| З-89 | Метки тем плана в старых уроках все одинаковые | `svc/school-offline.service.ts` | — | нет | 3 |
| З-120 | К «Последним двум неделям» не вернуться после выбора месяца | `wp/school-lessons/page.tsx` | — | нет | 3 |
| З-122 | На картинке сектора «Сектор N закрыт» дважды | `w/components/share-achievement.tsx` | — | нет | 3 |
| З-95 | Уровень в онлайн-заявке выводится как сохранён | `wp/online-lessons/[requestId]/page.tsx`, `w/lib/online-lessons-ui.ts` | — | нет | 3 |
| З-97 | Время «Онлайн-урок назначен» без пояса школы (проверить, жив ли поток заявок) | `svc/online-lessons.service.ts`, `docker-compose.prod.yml` | данные | нет | 3 |
| З-98 | Две функции пуша нигде не вызываются (мёртвый код) | `svc/push-notification.service.ts` | — | нет | 3 |
| З-100 | Временное ограничение отправки выглядит как закрытый диалог | `learning-dialog-mailbox.tsx`, `svc/learning-dialog.service.ts` | — | нет | 3 |
| З-101 | Счётчик непрочитанных расходится с уведомлениями | `svc/learning-dialog.service.ts` | — | нет | 3 |
| З-103 | Первое обращение к куратору — только текстом; архивный диалог не возвращается | `svc/learning-dialog.service.ts`, `learning-dialog-mailbox.tsx` | — | нет | 3 |
| З-104 | Флаг `messagesOnly` для ученика ничего не делает | `app-shell.tsx` | — | нет | 3 |
| В-37 | «Домашнее задание», «История занятий» набраны Inter, а не Playfair | `wp/tasks/school/[id]/page.tsx`, `wp/school-lessons/page.tsx` | — | нет | 3 |
| В-44 (ч.) | Золотая полоса прогресса 2,3:1, рамки `stone-300`, axe не подключён (подписи панели исправлены) | `w/components/progress-bar.tsx`, `globals.css` | — | нет | 3 |
| В-46 (ч.) | На iPhone крупный системный шрифт не работает (`text-size-adjust: 100%`, нет `-apple-system-body`); мелкий px на экранах ученика уже убран | `globals.css` | — | нет | 3 |

## 3. Исправленные и устаревшие

- **Исправлено на проде 73280dc:** З-4, З-14, З-27 (проверить часть CRM), З-29, З-31, З-49, З-61, З-69, З-79, З-80, З-93 (тупик снят, списка старых заявок нет), З-94, З-96, З-105, З-112; В-7, В-9, В-10, В-13, В-15, В-17, В-18, В-22, В-26.
- **Исправлено в ветке student-ux, не выкачено:** З-1, З-8, З-19, З-20, З-28 (срок входа 30 дней, а не 90), З-47; В-1, В-23, В-31 (остаток Coins ушёл в З-107, экрана-объяснения нет), В-40, В-41.
- **Устарело:** З-33, З-34 (страницы `/rewards` больше нет). Подпункты: З-46 (б), «Coins за неделю» в З-50, подпункт 2 З-35.

Пункты 5.x документа 16:
- 5.1, 5.2, 5.4, 5.5 — на проде. Остаток 5.1 (первый экран без прокрутки) — в ветке как В-1; пустые состояния — З-110 и В-4.
- 5.3 — на проде. Нет карточки «Следующий тест» сверху и связи тестов с сектором (приоритет 3); в остатке З-117 и З-119.
- 5.6 — на проде. Не сделано напоминание «ДЗ не открыто два дня» (приоритет 3); остальное — З-113…З-116.
- 5.7 — сид трёх ступеней по гитаре в коде; наполнение — за школой.
- 5.8 — процесс, не код.

## 4. Группы для пакетов (приоритеты 1 и 2)

Группы А–Н попарно не пересекаются по файлам. Пункты З-92 и В-45 разнесены по экранам между группами Г, Д, Е и В. Кроме К и Д, все группы задевают файлы невыкаченных веток student-ux и stage4, поэтому их начинать от ветки, где обе слиты.

- **А. Награды при откатах и в лиге (сервер)** — З-39, З-42/З-83, З-38, З-41, З-43, З-44 (сервер), З-82, З-87. Нужны решения по З-39, 41, 42, 43, 44 и проверка денег. Файлы: `svc/weekly-league.service.ts`, `svc/weekly-league-policy.ts`, `svc/student-lesson-result.service.ts`, `svc/offline-lesson-reversal.service.ts`, `svc/notification.service.ts`, `svc/crm-outbox.service.ts` (пересечения: stage4, money-fix).
- **Б. Вход (сервер)** — З-12, З-9, З-11. Файлы: `b/main.ts`, `b/presentation/middleware/error-handler.ts`, `b/presentation/routes/integration.routes.ts`, `b/application/repositories/auth.repository.ts`, `svc/student-provision.service.ts`, `b/lib/phone.ts` + миграция телефонов. `trustProxy` уже есть в stage4 dff34fa.
- **В. Курсы и тесты** — З-65, З-66, З-67, В-19, З-63, З-64 и В-45 (тесты). Файлы: `w/lib/homework-ui.ts`, `w/components/homework-test-result.tsx`, `svc/lesson-progress.service.ts`, `wp/lessons/[lessonId]/page.tsx`, `w/components/homework-submission-form.tsx`, `b/presentation/routes/cms.routes.ts`, `wp/tests/[testId]/page.tsx`, `wp/tests/page.tsx`, `b/presentation/routes/prepared-tests.routes.ts` (после stage4).
- **Г. Расписание и история** — З-90, З-121, З-85, З-86, З-119, В-11 (история), В-28, З-77, В-45 («Обновить»), З-92 (открытие расписания). Файлы: `wp/school-lessons/page.tsx`, `w/components/student-lesson-calendar.tsx`, `b/presentation/routes/school-offline.routes.ts`, `svc/school-offline.service.ts`, `b/infrastructure/crm/crm-client.ts`, `w/lib/school-offline-summary.ts`, `w/lib/api-client.ts`, `wp/monthly-plan/page.tsx`.
- **Д. Сообщения** — З-99, З-102, З-58, В-45 (сообщения), З-92 (открытие диалога). Файлы: `w/components/learning-dialog-mailbox.tsx` (общий с сотрудниками и семьёй), `svc/learning-dialog-membership.service.ts`, `svc/learning-dialog.service.ts`, `w/components/lesson-end-actions.tsx`.
- **Е. Coins и колокольчик** — З-35/З-36/З-106/З-107, З-92 (пуш, онлайн-заявка). Файлы: `svc/coins.service.ts`, `w/components/teacher-notification-center.tsx`, `w/components/auth-hero-panel.tsx`, `w/components/auth-platform-preview.tsx`, `wp/online-lessons/[requestId]/page.tsx`, `web_app/public/sw.js`. Coins на курсах убирает stage4.
- **Ж. Главная** — З-48/З-110/В-4, З-108 (нужно решение), В-3. Файлы: `wp/dashboard/page.tsx`, `w/components/student-today-card.tsx`, `w/components/practice-checkin.tsx`, `b/domain/student-today.ts`, `svc/student-home.service.ts`.
- **З. Профиль, лига, уровень** — В-24, З-37/З-124/В-33, З-44 (текст), З-45, В-32, В-11 (профиль), В-25 (LEVEL и XP). Файлы: `wp/settings/page.tsx`, `w/components/user-menu.tsx`, `wp/league/page.tsx`, `w/components/level-summary.tsx`, `svc/achievement.service.ts`, `b/presentation/routes/notifications.routes.ts`. Если уведомление о медали ставить в расчёт серии, З-45 переходит в группу А.
- **И. Оболочка и «Обучение»** — З-17/В-6, В-5, З-91/В-8, В-2 (шапка), З-117, В-11 (форма предложений), З-59. Файлы: `w/components/app-shell.tsx`, `w/components/student-workspace-navigation.tsx`, `w/lib/student-school-alerts.ts`, `wp/learning/page.tsx`, `wp/tasks/page.tsx`, `w/components/sector-proposals.tsx`, `w/lib/learning-overview.ts`.
- **К. Задания школы** — З-54/З-55, З-56, З-57, З-118. Файлы: `svc/task-sources/school-task.adapter.ts`, `svc/task-sources/offline-task.adapter.ts`, `svc/student-tasks.service.ts`, `w/lib/task-presentation.ts`, `w/components/unified-task-card.tsx`, `w/components/learning-homework-card.tsx` (с ветками не пересекается).
- **Л. Сектор и экзамен (сервер)** — З-73, З-75 (нужно решение), З-76. Файлы: `svc/sector-proposal.service.ts`, `svc/group-sector.service.ts`, `svc/learning-plan-v2.service.ts` (пересечение с money-fix), `svc/sector-exam.service.ts`.
- **М. Устройство: пуши, выход, обновление** — З-23, З-2, З-16. Файлы: `w/components/auth-provider.tsx`, `w/lib/push-notifications.ts`, `w/components/push-notifications-card.tsx`, `w/components/push-notification-prompt.tsx`, `b/presentation/routes/push.routes.ts`, `w/components/client-runtime-recovery.tsx`, `w/hooks/use-unsaved-changes.ts`.
- **Н. Иконка и логотип** — В-39 (нужно решение), В-42. Файлы: `web_app/public/manifest.webmanifest`, `w/app/layout.tsx`, `w/components/brand.tsx`, `web_app/public/icons/`, `web_app/public/brand/`.

Вне параллельных групп:
- **О. Общий стиль — только после А–Н, одним проходом.** Пункты В-12, В-16, В-21, В-27, В-29, В-34, В-35/З-84, В-36. Сначала общие файлы `w/app/globals.css`, `w/components/data-states.tsx`, `w/lib/ui.ts` и новые компоненты Badge и EmptyState, затем строки и классы на экранах всех групп. Нужны решения по В-27 и В-34.
- **В составе stage4:** З-5 (данные в адресе), З-7, «Внутренняя экосистема» на `/register` из В-25, Coins на курсах из З-107.