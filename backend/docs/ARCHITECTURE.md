# Maestro Backend Architecture

## Выбор стека: почему не Next.js API и не FastAPI

| Критерий | Next.js API Routes | FastAPI | **Standalone Node + Fastify + Prisma** ✅ |
|----------|-------------------|---------|------------------------------------------|
| Prisma ORM | ✅ Нативно | ❌ Нет (SQLAlchemy отдельно) | ✅ |
| TypeScript end-to-end | ✅ | ❌ Python | ✅ |
| Изоляция от frontend | ❌ В `web_app/` | ✅ | ✅ Отдельный `backend/` |
| Масштабирование API | Связан с Next deploy | ✅ Независимый сервис | ✅ |
| Команды / агенты | Смешение зон ответственности | Два стека | Один backend-стек |

**Решение:** отдельный **Fastify + Prisma + PostgreSQL** в `backend/`.

Frontend (`web_app/`) остаётся нетронутым и подключается через REST.

---

## Структура проекта

```text
backend/
├── prisma/
│   ├── schema.prisma      # Единый источник истины схемы
│   └── seed.ts            # Роли, permissions, достижения, первый admin
├── src/
│   ├── config/            # env validation (zod)
│   ├── domain/            # Errors, shared types
│   ├── application/
│   │   ├── repositories/  # Data access (Prisma queries)
│   │   └── services/      # Domain services (points, audit)
│   ├── infrastructure/
│   │   └── database/      # Prisma client singleton
│   └── presentation/
│       ├── plugins/       # JWT auth
│       ├── middleware/    # Error handler
│       └── routes/        # REST handlers (thin)
├── docs/                  # ERD, API, migrations, scaling
├── docker-compose.yml     # Local PostgreSQL
└── package.json
```

### Clean Architecture layers

```text
presentation  →  application  →  infrastructure
     ↓                ↓
   domain  ←─────────┘
```

- **presentation** — HTTP, валидация Zod, JWT, маршруты
- **application** — use-cases через repositories + services
- **infrastructure** — Prisma, внешние адаптеры (будущее: S3, email)
- **domain** — ошибки, типы, бизнес-инварианты (без ORM)

---

## RBAC

### Роли в БД (все заложены)

| slug | name | Текущее состояние |
|------|------|-------------------|
| `super_admin` | Super Admin | permissions заложены; CMS UI не считает роль content-admin |
| `admin` | Admin | активная Education CMS и учебное администрирование |
| `owner` | Owner | активная Education CMS и учебное администрирование |
| `branch_manager` | Branch Manager | permissions активны, отдельный интерфейс не выделен |
| `teacher` | Teacher | активны офлайн- и онлайн-уроки |
| `curator` | Curator | permissions активны, отдельный интерфейс не выделен |
| `student` | Student | активный ученический портал |

### Permissions (примеры)

- `directions.read`, `courses.read`, `lessons.read`
- `progress.read`, `progress.write`
- `homework.submit`, `homework.review`
- `news.read`, `news.manage`
- `catalog.manage`, `users.manage`
- `points.read`
- `online_lessons.read`, `online_lessons.request`, `online_lessons.manage`
- `coins.read`, `coins.award`
- `offline_school.read`, `offline_school.write`

Проверка: `request.user.permissions.includes(code)`.

---

## Multi-tenancy (задел)

```text
School → Branch → Course (optional branchId)
                 → Teacher
Direction → Course (универсальный каталог)
```

Бизнес-логика филиалов **не реализована** — только схема и seed-scaffold.

---

## Учебное ядро (Learning Core)

Универсальная иерархия:

```text
Direction → Course → CourseModule → Lesson → LessonMaterial
                                    └→ Homework → HomeworkSubmission
```

Прогресс:

```text
StudentCourse (enrollment)
LessonProgress (per lesson, status machine)
```

Геймификация:

```text
PointsTransaction (ledger) → SUM(amount) = balance
```

---

## Интеграция с frontend

Frontend подключён к API через централизованный data layer в
`web_app/src/lib/`. Базовый URL задаётся через
`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`.

Интеграция с CRM выполняется только backend-to-backend через подписанные
integration endpoints. Идентичность ученика и преподавателя определяется по
связям `crmStudentId` / `crmTeacherId`, а не по параметрам от frontend.
