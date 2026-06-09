# Масштабирование и риски расширения

## Текущая ёмкость (foundation)

Архитектура рассчитана на:

| Метрика | Оценка без изменений схемы |
|---------|---------------------------|
| Учеников | 10 000+ |
| Курсов | 500+ |
| Уроков | 5 000+ |
| Направлений | 50+ |
| Филиалов | 100+ (schema ready) |

Узкие места появятся раньше в **write-heavy** таблицах: `lesson_progress`, `points_transactions`, `audit_logs`.

---

## Горизонтальное масштабирование API

```text
                    ┌─────────┐
  Clients ─────────►│   LB    │
                    └────┬────┘
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      API instance   API instance   API instance
           └─────────────┼─────────────┘
                         ▼
                   PostgreSQL
                   (primary + replica)
```

- API stateless (JWT) — масштабируется без sticky sessions
- Read replicas для каталога и news
- Connection pooling: PgBouncer перед PostgreSQL

---

## Вертикальное разбиение (будущее)

| Bounded Context | Когда выделять |
|-----------------|----------------|
| Catalog Service | >50 редакторов контента одновременно |
| Progress Service | >1M lesson_progress rows |
| Gamification | Сложные правила начисления баллов |
| Notification | Push/email модуль |
| Payment | PCI scope isolation |

Сейчас — **modular monolith** (правильно для MVP).

---

## Кэширование

| Данные | Стратегия |
|--------|-----------|
| Directions, published courses | Redis TTL 5–15 min |
| News posts | Redis TTL 1–5 min |
| Student progress | Не кэшировать без invalidation |
| Points balance | Кэш с инвалидацией при INSERT в ledger |

---

## Файлы и медиа

`videoUrl`, `attachmentUrl`, `lesson_materials.url` — сейчас строки.

При масштабировании:

- S3 / Cloudflare R2 + CDN
- Отдельная таблица `media_assets` с checksum, mime, size
- Signed URLs для homework submissions

---

## Риски будущего расширения

### 🔴 Высокий

1. **Отсутствие tenant isolation в queries** — `schoolId`/`branchId` nullable, но API не фильтрует по tenant. При multi-school нужен middleware `tenantContext`.
2. **Lesson unlock logic не в foundation** — статусы есть, state machine не реализован. Риск рассинхрона progress при параллельных устройствах.
3. **Homework без file upload API** — только URL string. Нужен upload service.

### 🟡 Средний

4. **Slug global uniqueness на directions** — при multi-school slug должен быть `(school_id, slug)` UNIQUE.
5. **Audit log рост** — без retention policy таблица станет тяжёлой. Нужен archival → cold storage.
6. **Points ledger без idempotency key** — риск двойного начисления при retry.
7. **RBAC в JWT** — permissions кэшируются в токене. При смене роли нужен short TTL или refresh.

### 🟢 Низкий

8. **Course progress O(n) count** — при тысячах уроков заменить на materialized view.
9. **Нет read-model для dashboard** — агрегаты считаются on-the-fly.
10. **Teacher entity без связи с уроками** — появится `lesson_instructors` junction table.

---

## Рекомендации по этапам

| Этап | Действие |
|------|----------|
| **Сейчас (foundation)** | Modular monolith, Prisma, REST v1 |
| **10+ филиалов** | Tenant middleware, scoped slugs |
| **1000+ активных учеников** | Read replica, Redis cache каталога |
| **Платежи** | Отдельный сервис + webhook worker |
| **Расписание** | `schedule_slots`, `bookings` — новые таблицы, не расширять `lessons` |
