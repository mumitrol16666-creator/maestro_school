# Maestro School

Учебная платформа Maestro объединяет личный кабинет ученика, кабинет
преподавателя и административную Education CMS. Frontend подключен к REST API,
Learning Engine и интеграционному API Maestro CRM.

## Текущая структура

```text
maestro_school/
├── android/    Android Trusted Web Activity wrapper
├── web_app/    Next.js frontend с API-интеграцией
└── backend/    PostgreSQL + Prisma + Fastify API
```

Внутри `web_app` находятся кликабельные MVP-экраны, централизованный API
client, JWT-авторизация, typed responses и состояния загрузки/ошибок.
Для ролей Admin и Owner доступна Education CMS по адресу `/admin`.
Преподаватель использует тот же контур `/admin`, но видит только рабочие
разделы офлайн- и онлайн-уроков согласно permissions.
Ученики регистрируются через `/register`, выбирают опубликованный курс и
зачисляются кнопкой «Начать обучение» без скрытых побочных действий.

`backend/` — архитектурный фундамент: схема БД, RBAC, REST API v1, seed.
Подробности: [backend/README.md](./backend/README.md).

## Что уже реализовано

- курсы, модули, уроки, материалы, тестовые и обычные домашние задания;
- прогресс, баллы, достижения и Maestro Coins;
- проверка ДЗ и история попыток;
- вопросы ученика по уроку и заявка из урока;
- публичная заявка на пробный урок;
- онлайн-уроки: заявка, назначение, Zoom-ссылка, завершение, ДЗ и проверка;
- офлайн-уроки из CRM: расписание преподавателя, посещаемость, отчёт,
  очередь подтверждения администратора и публикация итогов ученику;
- вкладка преподавателя «Мои ученики», объединяющая его офлайн- и
  онлайн-учеников;
- раздел ученика «Уроки в школе» с расписанием, абонементами и итогами;
- in-app и web-push уведомления;
- управление пользователями, ролями и связями CRM ↔ Learning Platform;
- профиль, смена пароля, аватар и PWA-установка.

## Границы

- CRM остаётся источником истины для заявок, учеников офлайн-школы,
  расписания, кабинетов, абонементов, оплат, списаний и зарплат.
- Learning Platform владеет учебным контентом, прогрессом онлайн-курсов,
  учебными заявками, ДЗ, баллами, Coins и пользовательским опытом.
- Платежи не проводятся в Learning Platform.
- Полноценный чат не реализован; вместо него используются вопросы по урокам,
  комментарии к ДЗ и уведомления.

Подключенные endpoint-ы и ограничения описаны в `web_app/INTEGRATION.md`.
Документация CMS находится в `backend/docs/CMS.md`.
Актуальный аудит реализации: [IMPLEMENTATION_AUDIT_2026-06-19.md](./IMPLEMENTATION_AUDIT_2026-06-19.md).

## Деплой на VPS

Автодеплой через GitHub Actions на `178.105.59.89:14579` (root):

- workflow: `.github/workflows/deploy.yml`
- инструкция: [deploy/README.md](./deploy/README.md)

Продакшен: **https://maestro-school.duckdns.org** (nginx + certbot на сервере).

- Логин: https://maestro-school.duckdns.org/login
- Админка: https://maestro-school.duckdns.org/admin
- Nginx config: [deploy/nginx-maestro-school.conf](./deploy/nginx-maestro-school.conf)
- Android APK: https://maestro-school.duckdns.org/downloads/maestro-school.apk
