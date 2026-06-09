# Homework Review — Maestro

Документация по проверке домашних заданий и видеоплееру урока.

## Видеоплеер (LessonVideoPlayer)

Компонент: `web_app/src/components/lesson-video-player.tsx`  
Парсер URL: `web_app/src/lib/parse-video-url.ts`

### Поддерживаемые провайдеры

| Провайдер | Статус | Примеры URL |
|-----------|--------|-------------|
| **YouTube** | ✅ Основной | `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/` |
| **Vimeo** | ✅ Extensible | `vimeo.com/123`, `player.vimeo.com/video/123` |
| **Cloudflare Stream** | ✅ Extensible | `videodelivery.net/<id>`, `*.cloudflarestream.com` |

### Порядок внедрения (рекомендация)

1. **Сейчас:** YouTube embed iframe — быстро и бесплатно
2. **Потом:** Vimeo — domain-restricted embedding
3. **Позже:** Cloudflare Stream — signed URLs, своя платформа

### Состояния плеера

- `locked` — урок закрыт
- empty — `videoUrl` не задан
- error — URL не распознан
- iframe — успешный embed

---

## Admin: Проверка ДЗ

Страницы:
- `/admin/homework-review` — очередь
- `/admin/homework-review/:submissionId` — карточка работы

RBAC: только `admin` и `owner` (AdminGuard + `homework.review`).

### API

#### Список работ

```http
GET /api/v1/admin/homework-submissions?status=submitted&search=...&page=1&limit=20
```

Фильтр `status`:
| Значение | Submission status |
|----------|-------------------|
| `submitted` | `submitted` |
| `reviewed` | `under_review` |
| `completed` | `approved` |
| `rejected` | `rejected` |

#### Детали работы

```http
GET /api/v1/admin/homework-submissions/:submissionId
```

#### Проверка

```http
PATCH /api/v1/homeworks/submissions/:submissionId/review
```

**Approve:**
```json
{ "action": "approve", "reviewComment": "Отлично!" }
```
→ `COMPLETED`, баллы, unlock next lesson

**Reject:**
```json
{ "action": "reject", "reviewComment": "Переделайте упражнение" }
```
→ урок `AVAILABLE`, `reviewComment` обязателен

### Поля submission

| Поле | Описание |
|------|----------|
| `comment` | Комментарий **ученика** (не перезаписывается) |
| `reviewComment` | Комментарий **преподавателя** |
| `attachmentUrl` | Ссылка на работу ученика |

Миграция: `20250610120000_homework_review_comment`

---

## E2E сценарий

1. Admin создаёт урок с YouTube `videoUrl` в CMS
2. Student открывает `/lessons/:id` — видит embed
3. Student отправляет домашку
4. Admin → «Проверка ДЗ» → открывает работу
5. Approve → баллы + следующий урок
6. Reject (с комментарием) → урок снова доступен

```bash
npm run e2e   # backend API flow
cd ../web_app && npm run build   # frontend build
```
