# Maestro Student App - Foundation Execution Plan

Дата подготовки: 22 августа 2026 года  
Проект: `maestro-learning-platform`  
Production: `https://maestro-school.duckdns.org`
Статус: выполнен; итоговая проверка записана в implementation report

## Цель

Подготовить доказуемый технический фундамент ученического приложения: связать
production с точным GitHub SHA, закрыть разрывы основного учебного сценария,
стабилизировать главную и закрепить поведение автоматическими проверками.

Foundation не является визуальным редизайном и не создаёт данные или механику,
которых нет в backend.

## Source of truth

- repository: `mumitrol16666-creator/maestro_school`;
- branch: `main`;
- production path: `/var/www/maestro_school`;
- deployment chain: workflow Learning Platform -> workflow CRM ->
  `/var/www/maestro_crm/deploy/deploy-maestro-all.sh`;
- production-функция существует только при наличии кода, API/данных и
  успешного smoke;
- макет или статичный текст не считаются реализованной функцией.

Подробные команды проверки записаны в
`docs/student-application-source-of-truth.md`.

## Объём Foundation

1. Зафиксировать baseline, не затронув dirty workspace владельца.
2. Добавить единый release fingerprint в API, HTML, PWA и deploy.
3. Расширить локальный e2e и добавить read-only production smoke.
4. Разрешить ученику завершать начатый урок без домашнего задания.
5. Вернуть `completionCoinsReward` в публичном списке курсов.
6. Выбирать текущий курс по последней учебной активности.
7. Изолировать ошибки второстепенных данных на главной.
8. Документировать реальные и отсутствующие игровые механики.
9. Выполнить локальную регрессию, push, deploy и production-проверку.

## Общие правила

- не удалять и не откатывать пользовательские изменения;
- не изменять Prisma schema без отдельного обоснования;
- критическая ошибка dashboard остаётся критической;
- новости, достижения, каталог и offline summary деградируют локально;
- завершение и награды должны быть идемпотентными;
- mutating e2e запрещён против production;
- production smoke остаётся строго read-only;
- каждый пакет фиксируется отдельным атомарным коммитом.

## Порядок

`FND-00 -> FND-01 -> FND-03 -> FND-04 -> FND-05 -> FND-06 -> FND-07 -> FND-02 -> FND-08`

## FND-00. Baseline

### Результат

- актуальные local/remote SHA записаны;
- dirty workspace владельца защищён;
- backend и frontend baseline выполнен в чистом clone;
- ограничения baseline задокументированы.

### Definition of Done

Файл `docs/student-foundation-baseline-2026-08-22.md` находится в репозитории,
а пользовательские изменения не включены в Foundation-коммиты.

## FND-01. Release fingerprint

### Изменения

- backend `/health` возвращает `releaseSha` и `builtAt`;
- frontend HTML содержит `<meta name="maestro-release">`;
- PWA cache получает версию из того же SHA и удаляет только старые
  `maestro-*` cache;
- deploy разрешает SHA через `git ls-remote`, скачивает immutable tarball и
  проверяет совпадение локального и публичного API/web SHA;
- CRM deployment-репозиторий содержит тот же immutable deploy-контракт.

### Definition of Done

GitHub `main`, `/health` и HTML meta показывают один 40-символьный SHA.

## FND-02. Regression harness

### Локальный e2e

Сценарий создаёт отдельного ученика, два курса и проверяет:

- регистрацию и защиту от дубля;
- preview без автоматического enrollment и без защищённого контента;
- запрет enrollment в unpublished курс;
- idempotent enrollment;
- locked lesson protection;
- урок с ДЗ, submission, review, баллы и открытие следующего урока;
- запрет self-complete для обычного и тестового ДЗ;
- self-complete урока без ДЗ;
- однократное начисление баллов и course Coins;
- выбор текущего курса до активности, после активности и после завершения;
- list/detail контракт `completionCoinsReward`.

### Production smoke

Read-only сценарий проверяет health/database, 40-символьный SHA, совпадение HTML
meta, публичные directions и числовую неотрицательную награду каждого курса.

### Definition of Done

E2E проходит на чистой базе после всех миграций; production smoke не содержит
POST/PUT/PATCH/DELETE.

## FND-03. Урок без домашнего задания

### Поведение

- `POST /api/v1/lessons/:lessonId/complete` доступен только ученику с
  `progress.write`;
- завершить можно только собственный `in_progress` урок без ДЗ;
- урок с ДЗ возвращает `LESSON_REQUIRES_HOMEWORK`;
- состояние меняется атомарно и повторный вызов не дублирует side effects;
- после завершения открывается следующий урок или завершается курс;
- frontend показывает кнопку только в допустимом состоянии и выводит точный
  результат операции.

### Definition of Done

Unit и e2e доказывают переход состояния и идемпотентность наград.

## FND-04. Награда курса

### Поведение

`GET /api/v1/courses` и detail возвращают `completionCoinsReward: number`.
Награда начисляется только при первом завершении курса.

### Definition of Done

Публичный list/detail контракт и однократное начисление проверены e2e.

## FND-05. Текущий курс

### Алгоритм

1. Явно выбранный активный курс имеет приоритет.
2. Иначе выбирается enrollment с самой свежей реальной активностью
   `LessonProgress.updatedAt` среди учебных статусов.
3. Если активности нет, используется последнее enrollment с детерминированным
   tie-break.
4. Завершённый курс исключается.

### Definition of Done

E2E доказывает переключение текущего курса после старта урока и fallback после
завершения курса.

## FND-06. Частичная деградация dashboard

### Поведение

- основной dashboard-запрос остаётся критическим;
- news, achievements, courses и offline summary загружаются независимо;
- ошибка одного второстепенного ресурса не скрывает остальную страницу;
- рядом с недоступным блоком есть локальная ошибка и повторная загрузка;
- существующие rank, rewards и weekly league сохраняются.

### Definition of Done

Frontend typecheck и production build проходят, а экран не использует общий
фатальный `Promise.all` для второстепенных ресурсов.

## FND-07. Контракт геймификации

К моменту реализации актуальный `origin/main` уже содержит настоящие ranks,
магазин rewards, расход Coins, weekly league XP и weekly streak. Foundation их
не удаляет. Не реализованы и не должны симулироваться:

- отдельный глобальный XP;
- отдельный глобальный level;
- daily streak;
- проценты навыков без модели компетенций.

Точный контракт находится в `docs/student-gamification-contract.md`.

### Definition of Done

UI не показывает фиктивные значения; реальные механики привязаны к API и данным.

## FND-08. Release gate

Перед push:

- backend lint/typecheck/unit/build;
- frontend lint/typecheck/build;
- `git diff --check`;
- `bash -n` deployment scripts;
- e2e на чистой локальной базе.

После push:

- дождаться CRM и Learning Platform deploy;
- сравнить GitHub SHA, API health и frontend meta;
- запустить read-only production smoke;
- проверить desktop/mobile/PWA без изменения production-данных;
- записать результат и остаточные риски в implementation report.

### Rollback

Откат выполняется отдельным revert-коммитом в `main`. Foundation не содержит
миграций, поэтому откат к предыдущему release SHA не требует обратной миграции
БД. После отката обязательны те же release fingerprint и smoke-проверки.
