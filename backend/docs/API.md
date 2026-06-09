# Maestro REST API v1

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

Phase-1 вход для Admin и Student.

**Body**
```json
{
  "email": "student@maestro.local",
  "password": "student123"
}
```

**Response 200**
```json
{
  "data": {
    "token": "eyJhbG...",
    "user": {
      "id": "uuid",
      "email": "student@maestro.local",
      "firstName": "Алексей",
      "lastName": "Миронов",
      "avatar": null,
      "role": "student",
      "points": 1240
    }
  }
}
```

### `GET /auth/me`

Требует JWT.

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
      "direction": { "id": "...", "title": "Гитара", "slug": "guitar" }
    }
  ]
}
```

> `progress` вычисляется при наличии JWT (опционально в будущем); сейчас 0 без auth context на публичных routes.

### `GET /courses/:courseId`

Детали курса с модулями и уроками.

---

## Lessons

### `GET /lessons/:lessonId`

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
{ "status": "ok", "service": "maestro-api" }
```

---

## Не входит в scope (v0.1)

- Оплата
- CRM
- Расписание
- Чаты
- Push-уведомления
- CRUD админки каталога (только read API + homework submit)
