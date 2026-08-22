# Maestro Student Application - Source of Truth

Последняя проверка: 22 августа 2026 года.

## Production-контур

| Назначение | Значение |
|---|---|
| GitHub repository | `mumitrol16666-creator/maestro_school` |
| Ветка релиза | `main` |
| Production | `https://maestro-school.duckdns.org` |
| API | `https://maestro-school.duckdns.org/api/v1` |
| Health | `https://maestro-school.duckdns.org/health` |
| Путь на VPS | `/var/www/maestro_school` |
| CRM | `https://app-maestro-school.duckdns.org` |

CRM и Student Application - разные приложения. Интерфейс на
`app-maestro-school.duckdns.org` нельзя использовать как доказательство наличия
функции в ученическом приложении.

## Фактическая цепочка деплоя

1. Push в `maestro_school/main` запускает `.github/workflows/deploy.yml`.
2. Workflow подключается к VPS и обновляет репозиторий `maestro_crm`.
3. Запускается `/var/www/maestro_crm/deploy/deploy-maestro-all.sh learning-platform`.
4. Скрипт определяет точный SHA `maestro_school/main` и скачивает tarball этого SHA.
5. Исходники синхронизируются в `/var/www/maestro_school`.
6. Backend и frontend собираются с одинаковыми `releaseSha` и `builtAt`.
7. PM2 перезапускает `maestro-api` и `maestro-web`.

## Как доказать версию production

```bash
git ls-remote https://github.com/mumitrol16666-creator/maestro_school.git \
  refs/heads/main

curl -fsS https://maestro-school.duckdns.org/health

curl -fsS https://maestro-school.duckdns.org/login \
  | grep -o 'name="maestro-release" content="[^"]*"'
```

SHA GitHub, поле `releaseSha` в health и `maestro-release` в HTML должны
совпадать. Несовпадение означает незавершённый или неконсистентный deploy.

## Правило проверки функций

Макет, скриншот и frontend-тип не считаются работающей функцией. Функция
считается реализованной только если одновременно существуют:

1. источник данных или формально определённое бизнес-правило;
2. backend/API-контракт, если данные серверные;
3. рабочий пользовательский интерфейс;
4. сохранение результата;
5. regression test или воспроизводимый smoke-сценарий;
6. подтверждение, что нужный commit развернут в production.

Игровые показатели разрешено показывать только при наличии модели, формулы,
истории начислений и защиты от повторного начисления.
