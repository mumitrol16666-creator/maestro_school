# Maestro Frontend Integration

The student portal uses the REST API configured by:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Data layer

- Central client: `src/lib/api-client.ts`
- API response types: `src/types/api.ts`
- Backend-to-UI adapters: `src/lib/adapters.ts`
- Auth context and guard: `src/components/auth-provider.tsx`,
  `src/components/auth-guard.tsx`
- Shared states: `src/components/data-states.tsx`

The client stores the JWT in local storage, adds `Authorization: Bearer <token>`
automatically, normalizes API errors, clears the session on `401`, and redirects
to `/login`.

## Connected endpoints

| Endpoint | Usage |
| --- | --- |
| `POST /auth/login` | Student and admin login |
| `GET /auth/me` | Session validation and profile |
| `GET /students/me/dashboard` | Student dashboard |
| `GET /students/me/progress` | Course access, lesson statuses, progress, points history |
| `GET /directions` | Direction labels |
| `GET /courses` | Course catalog |
| `GET /courses/:id` | Course modules and lessons |
| `GET /lessons/:id` | Lesson, materials, homework |
| `POST /lessons/:lessonId/start` | Start available lesson |
| `POST /homeworks/:homeworkId/submissions` | Submit comment and attachment URL |
| `GET /news` | Maestro board |

## Status mapping

Backend lesson statuses are normalized case-insensitively:

- `LOCKED` → `locked`
- `AVAILABLE` → `available`
- `IN_PROGRESS` → `in_progress`
- `SUBMITTED` → `submitted`
- `REVIEWED` → `reviewed`
- `COMPLETED` → `completed`

Catalog endpoints do not currently include student-specific lesson statuses.
The frontend merges course and lesson catalog data with
`GET /students/me/progress` without changing backend behavior.

## Role behavior

- Student login redirects to `/dashboard`.
- `admin` and `owner` login redirects to `/admin`.
- The separate Education CMS uses `/admin/*` API endpoints and the existing
  `catalog.manage` and `news.manage` permissions.
- Student access to CMS API is rejected with `403`.

## Verification

Frontend checks completed:

```bash
npm run lint
npm run typecheck
npm run build
```

Backend typecheck/build and Learning Engine unit tests also pass. The live CMS
scenario is available as `npm run cms:smoke`; it requires PostgreSQL, applied
migrations, seed data, and the running backend.

See `../backend/docs/CMS.md` for CMS endpoints, local media storage, RBAC, and
the complete content-authoring scenario.
