# Student Foundation Baseline

Дата фиксации: 22 августа 2026 года.

## Исходные версии

- защищённый локальный workspace владельца начинался с
  `aef19c3e3f16c18ee670a1316c2fbab3588ff120` и содержал незавершённые изменения;
- перед переносом Foundation удалённый `origin/main` уже находился на
  `d0673b8a13fa22c55c6be372e487f2a3561beae1`;
- Foundation собран в отдельном чистом clone от актуального `origin/main`;
- исходный workspace и его незакоммиченные файлы не изменялись и не очищались;
- production SHA до FND-01 достоверно не определялся.

## Защищённая незавершённая работа

До начала Foundation в основном workspace уже существовали изменения месячных
планов, teacher/offline-функций, Prisma schema, миграций и документов. Они не
переносились в Foundation-коммиты вручную. Совпавшие функции из 23 новых
коммитов `origin/main` принимались как удалённый source of truth.

## Baseline актуального origin/main

Зависимости установлены командой `npm ci` отдельно в `backend` и `web_app`.

Успешно выполнены:

- backend typecheck;
- backend unit: 60 тестов;
- backend production build;
- frontend typecheck;
- frontend production build: 37 маршрутов.

После реализации Foundation backend содержит 61 unit-тест. Расширенный e2e был
выполнен на отдельной чистой базе `maestro_foundation_e2e` после применения всех
34 миграций.

## Известные ограничения baseline

- исходная локальная база `maestro` содержит старую незавершённую миграцию
  `20260723100000_prepared_student_tests`; Foundation её не исправляет и не
  изменяет;
- `npm ci` сообщает 4 high severity уязвимости backend и 1 high severity
  уязвимость frontend; обновление зависимостей не входит в этот этап;
- Foundation не меняет Prisma schema и не добавляет миграции.
