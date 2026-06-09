# Lesson Experience — Maestro

Документация по прохождению урока, сдаче домашних заданий и проверке.

## Страница урока (ученик)

**Путь:** `/lessons/:lessonId`

### Блоки

1. Заголовок и статус урока (`locked` → `completed`)
2. Описание урока
3. `LessonVideoPlayer` (YouTube / Vimeo / Cloudflare)
4. Материалы (`pdf`, `image`, `file`, `link`)
5. Форма сдачи ДЗ (`HomeworkSubmissionForm`)
6. История попыток (`HomeworkAttemptHistory`)
7. Комментарий преподавателя после reject
8. Кнопка «Следующий урок» при `completed`

### Статусы урока

| Статус | Поведение |
|--------|-----------|
| `locked` | Видео закрыто, отправка ДЗ запрещена |
| `available` | Можно начать урок |
| `in_progress` | Можно сдать ДЗ |
| `submitted` | Форма заблокирована, ожидание проверки |
| `reviewed` | Форма заблокирована |
| `completed` | Повторная отправка запрещена, следующий урок открыт |

---

## Сдача домашнего задания

### Форма

- Комментарий ученика
- Тип работы: `text` | `video` | `audio` | `file`
- Ссылка (для video/audio/file)
- Кнопка «Отправить на проверку»

Загрузка файлов: ученик вставляет внешнюю ссылку. Admin Media Library (`POST /admin/media`, base64) — только для CMS.

### API

```http
POST /api/v1/homeworks/:homeworkId/submissions
```

```json
{
  "comment": "Описание работы",
  "attachmentUrl": "https://...",
  "attachmentType": "video"
}
```

**Guards:**
- `locked` → 400
- `completed` → 400 (повторная отправка)
- `submitted` / `reviewed` → 400 (ожидание проверки)
- `available` / `in_progress` → разрешено (после reject урок снова `available`)

```http
GET /api/v1/homeworks/:homeworkId/submissions/me
```

Возвращает историю попыток с `attemptNumber`, `reviewComment`, `attachmentType`.

---

## История попыток

Одна домашка → несколько `HomeworkSubmission` от одного ученика.

| Поле | Описание |
|------|----------|
| `attemptNumber` | Порядковый номер (по `createdAt`) |
| `comment` | Комментарий ученика |
| `attachmentUrl` / `attachmentType` | Материал работы |
| `status` | `submitted` / `approved` / `rejected` |
| `reviewComment` | Комментарий преподавателя |
| `reviewedAt` | Дата проверки |

---

## Проверка (админ)

**Пути:** `/admin/homework-review`, `/admin/homework-review/:submissionId`

### API

```http
GET /api/v1/admin/homework-submissions/:submissionId/attempts
```

История всех попыток ученика по этому заданию.

```http
PATCH /api/v1/homeworks/submissions/:submissionId/review
```

**Approve:** `action: "approve"`, `reviewComment` опционален → `COMPLETED`, баллы, unlock next lesson.

**Reject:** `action: "reject"`, `reviewComment` обязателен → урок `AVAILABLE`, старая попытка в истории.

### Защита баллов

`awardLessonPoints()` идемпотентен по `(studentId, lessonId)` — повторное начисление невозможно.

---

## Миграции

| Миграция | Изменение |
|----------|-----------|
| `20250610120000_homework_review_comment` | `review_comment` |
| `20250611120000_homework_attachment_type` | `attachment_type` enum |

---

## E2E сценарии

### 1. Успешное прохождение

1. Student открывает доступный урок → смотрит видео
2. Отправляет ДЗ с комментарием и ссылкой → `SUBMITTED`
3. Admin принимает → Student видит `COMPLETED`, баллы, следующий урок

### 2. Доработка

1. Student отправляет → Admin reject с комментарием
2. Student видит комментарий, отправляет новую попытку
3. Admin принимает → история показывает 2 попытки

### 3. Защита

- `COMPLETED` → повторная отправка 400
- `locked` → отправка 400

```bash
cd backend && npm run db:migrate && npm run build && npm run e2e
cd ../web_app && npm run build
```
