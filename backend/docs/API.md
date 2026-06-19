# Maestro REST API v1

> Актуализация 19 июня 2026 года: кроме базового Learning Engine в API
> реализованы онлайн-уроки, офлайн-школа через CRM, управление пользователями,
> вопросы по урокам, уведомления и push. Ниже приведён индекс этих групп.

## Реализованные расширения

### Публичная заявка

- `POST /trial-bookings` — публичная заявка на пробный урок с передачей в CRM.

### Профиль

- `PATCH /auth/me` — обновить профиль;
- `POST /auth/me/avatar` — обновить аватар и синхронизировать его в CRM;
- `PATCH /auth/me/password` — сменить пароль;
- `POST /auth/sso-exchange` — обменять SSO token.

### Уроки в школе

- `GET /students/me/offline-summary` — расписание, история, абонементы,
  долг, заморозки и опубликованные итоги ученика;
- `GET /teachers/me/offline-lessons` — расписание преподавателя;
- `GET /teachers/me/students` — офлайн- и онлайн-ученики текущего преподавателя;
- `GET /teachers/me/offline-lessons/:crmClassId` — карточка урока;
- `GET /teachers/me/offline-lessons/:crmClassId/students` — ученики;
- `POST .../start`, `.../finish`, `.../submit`, `.../not-held`,
  `.../attendance` — рабочий цикл преподавателя;
- `GET /admin/offline-lessons/pending-review` — очередь администратора;
- `POST /admin/offline-lessons/:crmClassId/attendance` — корректировка;
- `POST /admin/offline-lessons/:crmClassId/approve` — подтверждение.

### Онлайн-уроки и Coins

- `GET /students/me/coins`;
- `GET/POST /online-lessons/requests`;
- `GET /online-lessons/requests/:id`;
- `POST /online-lessons/requests/:id/submissions`;
- `GET /admin/online-lesson-requests`;
- `PATCH .../assign`, `.../schedule`, `.../cancel`, `.../no-show`;
- `POST .../complete`;
- `PATCH /admin/online-lesson-submissions/:id/review`.

### Вопросы по уроку

- `POST /lessons/:lessonId/questions`;
- `POST /lessons/:lessonId/signup`;
- `GET /admin/lesson-questions`;
- `GET /admin/lesson-questions/pending-count`;
- `PATCH /admin/lesson-questions/:id`.

### Пользователи

- `GET /admin/users/roles`;
- `GET /admin/users`, `GET /admin/users/:id`;
- `PATCH /admin/users/:id/role`;
- `GET/POST /admin/users/:id/crm-link`;
- `GET /admin/crm-lookup`;
- `GET /admin/students`, `GET /admin/students/:id`.

### Уведомления и push

- `GET /students/me/notifications`;
- `GET /students/me/notifications/unread-count`;
- `PATCH /students/me/notifications/:id/read`;
- `POST /students/me/notifications/read-all`;
- `GET /push/vapid-public-key`;
- `POST/DELETE /push/subscribe`;
- `POST /push/test`.

Фактические validation schema и guards находятся в
`backend/src/presentation/routes/` и являются приоритетным источником при
расхождении с примерами ниже.

Base URL: `http://localhost:4000/api/v1`

## Общие соглашения

- Все `id` — UUID v4
- Успешный ответ: `{ "data": ... }`
- Ошибка: `{ "error": { "code": "...", "message": "..." } }`
- Аутентификация: `Authorization: Bearer <jwt>` (где требуется)
- Даты: ISO 8601 UTC

---

## Auth

### `POST /auth/login`

Вход по email для зарегистрированного пользователя.

**Body**
```json
{
  "email": "student@example.com",
  "password": "strong-password"
}
```

**Response 200**
```json
{
  "data": {
    "token": "eyJhbG...",
    "user": {
      "id": "uuid",
      "email": "student@example.com",
      "firstName": "Анна",
      "lastName": "Музыкант",
      "avatar": null,
      "phone": null,
      "role": "student",
      "permissions": ["courses.read", "lessons.read"],
      "points": 1240
    }
  }
}
```

### `POST /auth/register`

Открытая регистрация ученика. Всегда создает роль `student`, нормализует email
и возвращает JWT с полным профилем. Повторный email возвращает `409`.

```json
{
  "firstName": "Анна",
  "lastName": "Музыкант",
  "email": "student@example.com",
  "phone": "+7 700 000 00 00",
  "password": "strong-password"
}
```

### `GET /auth/me`

Требует JWT. Возвращает имя, фамилию, телефон, email, роль, permissions и баллы.

---

## Directions

### `GET /directions`

Публичный список опубликованных направлений.

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Гитара",
      "slug": "guitar",
      "description": "...",
      "isPublished": true
    }
  ]
}
```

---

## Courses

### `GET /courses`

Query params:

| Param | Type | Description |
|-------|------|-------------|
| `directionId` | uuid | Фильтр по направлению |
| `directionSlug` | string | Альтернатива directionId |

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "directionId": "uuid",
      "title": "Гитара. Курс 1",
      "description": "...",
      "thumbnail": null,
      "difficultyLevel": "beginner",
      "modulesCount": 1,
      "lessonsCount": 4,
      "progress": 68,
      "enrollmentStatus": "active",
      "direction": { "id": "...", "title": "Гитара", "slug": "guitar" }
    }
  ]
}
```

> `progress` вычисляется при валидном JWT ученика. Для гостевого запроса
> публичного каталога возвращается 0 и отсутствует активное зачисление.

### `GET /courses/:courseId`

Публичное описание опубликованного курса с модулями и названиями уроков.
Не содержит `videoUrl`, материалы или домашнее задание и не создает зачисление.

### `POST /courses/:courseId/enroll`

🔒 JWT ученика. Явно и идемпотентно зачисляет в опубликованный курс,
инициализирует прогресс и открывает первый урок.

---

## Lessons

### `GET /lessons/:lessonId`

🔒 JWT ученика + зачисление + открытый статус урока. Закрытый урок возвращает `403`.

**Response 200**
```json
{
  "data": {
    "id": "uuid",
    "moduleId": "uuid",
    "courseId": "uuid",
    "title": "Первые аккорды",
    "description": "...",
    "videoUrl": "https://...",
    "sortOrder": 2,
    "pointsReward": 100,
    "materials": [
      { "id": "uuid", "type": "pdf", "title": "...", "url": "..." }
    ],
    "homework": { "id": "uuid", "description": "..." }
  }
}
```

---

## Learning Engine

### `POST /lessons/:lessonId/start`

🔒 JWT + permission `progress.write`

Переводит урок `AVAILABLE` → `IN_PROGRESS`.

### `GET /students/me/dashboard`

🔒 JWT + permission `progress.read`

Данные для главной страницы ученика (без UI):

```json
{
  "data": {
    "currentCourse": { "id": "...", "title": "...", "direction": { ... } },
    "progressPercent": 25,
    "completedLessonsCount": 1,
    "totalLessonsCount": 4,
    "points": 130,
    "nextAvailableLesson": { "id": "...", "title": "...", "status": "in_progress" }
  }
}
```

---

## Progress

### `GET /students/me/progress`

🔒 JWT + permission `progress.read`

Query: `courseId` (optional)

Запрос с `courseId` требует существующего зачисления и не создает его.

**Response 200**
```json
{
  "data": {
    "points": 1240,
    "enrollments": [
      { "id": "...", "status": "active", "course": { "id": "...", "title": "..." } }
    ],
    "lessons": [
      {
        "lessonId": "uuid",
        "status": "in_progress",
        "completedAt": null,
        "lesson": { "id": "...", "title": "...", "module": { "courseId": "..." } }
      }
    ]
  }
}
```

**Lesson progress statuses:** `locked` | `available` | `in_progress` | `submitted` | `reviewed` | `completed`

---

## News (Maestro Board)

### `GET /news`

Query: `limit` (1–50, default 20)

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Летний концерт Maestro",
      "content": "...",
      "excerpt": "...",
      "publishedAt": "2026-06-09T10:30:00.000Z",
      "author": { "id": "uuid", "name": "Maestro Admin" }
    }
  ]
}
```

---

## Homework

### `POST /homeworks/:homeworkId/submissions`

🔒 JWT + permission `homework.submit`

Переводит прогресс урока в `SUBMITTED`.

**Body**
```json
{
  "comment": "Записал видео, ссылка ниже",
  "attachmentUrl": "https://storage.example.com/hw/video.mp4"
}
```

**Response 201**
```json
{
  "data": {
    "id": "uuid",
    "homeworkId": "uuid",
    "status": "submitted",
    "lessonProgress": "submitted",
    "createdAt": "..."
  }
}
```

### `PATCH /homeworks/submissions/:submissionId/review`

🔒 JWT + permission `homework.review` (Admin)

**Body**
```json
{ "action": "approve", "reviewNote": "Отлично!" }
```

или

```json
{ "action": "reject", "reviewNote": "Переделайте упражнение" }
```

**Response 200 (approve)**
```json
{
  "data": {
    "submission": { "id": "...", "status": "approved", "reviewedAt": "..." },
    "lessonStatus": "completed",
    "pointsAwarded": true
  }
}
```

**Response 200 (reject)** — `lessonStatus: "available"`, `pointsAwarded: false`

---

## Health

### `GET /health`

```json
{ "status": "ok", "service": "maestro-api", "database": "ok" }
```

---

## Не входит в scope (v0.1)

- Оплата
- CRM
- Расписание
- Чаты
- Push-уведомления
- дополнительные бизнес-модули вне обучения и CMS
