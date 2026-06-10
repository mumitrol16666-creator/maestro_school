# Maestro School

Проект развивается поэтапно. Frontend личного кабинета подключен к REST API
и существующему Learning Engine.

## Текущая структура

```text
maestro_school/
├── web_app/    Next.js frontend с API-интеграцией
└── backend/    PostgreSQL + Prisma + Fastify API
```

Внутри `web_app` находятся кликабельные MVP-экраны, централизованный API
client, JWT-авторизация, typed responses и состояния загрузки/ошибок.
Для ролей Admin и Owner доступна отдельная Education CMS по адресу `/admin`.
Ученики регистрируются через `/register`, выбирают опубликованный курс и
зачисляются кнопкой «Начать обучение» без скрытых побочных действий.

`backend/` — архитектурный фундамент: схема БД, RBAC, REST API v1, seed.
Подробности: [backend/README.md](./backend/README.md).

Следующие технические слои пока не реализуются:

- расписание и CRM;
- платежи;
- чаты и уведомления;

Подключенные endpoint-ы и ограничения описаны в `web_app/INTEGRATION.md`.
Документация CMS находится в `backend/docs/CMS.md`.

## Деплой на VPS

Автодеплой через GitHub Actions на `178.105.59.89:14579` (root):

- workflow: `.github/workflows/deploy.yml`
- инструкция: [deploy/README.md](./deploy/README.md)

После деплоя: Web `http://178.105.59.89:3000`, API `http://178.105.59.89:4000/api/v1`.
