# Maestro Education CMS

## Purpose

The CMS lets `admin` and `owner` users create and publish educational content
without developer involvement. It does not change Learning Engine, progress,
authentication, roles, scheduling, CRM, payments, or chats.

Admin UI: `http://localhost:3000/admin`  
Admin API prefix: `http://localhost:4000/api/v1/admin`

## Access

Every CMS route requires:

1. valid JWT;
2. role `admin` or `owner`;
3. existing RBAC permission:
   - `catalog.manage` for directions, courses, modules, lessons, materials,
     homeworks, and media;
   - `news.manage` for Maestro Board posts.

Students receive `403 Forbidden`.

## Managed hierarchy

```text
Direction
└── Course
    └── CourseModule
        └── Lesson
            ├── LessonMaterial
            └── Homework
```

Soft delete is used for directions, courses, modules, lessons, homeworks, and
news. Lesson materials and local media files are deleted directly.

## API endpoints

| Resource | Endpoints |
| --- | --- |
| Directions | `GET/POST /admin/directions`, `PATCH/DELETE /admin/directions/:id`, `POST /admin/directions/:id/publish` |
| Courses | `GET/POST /admin/courses`, `GET/PATCH/DELETE /admin/courses/:id`, `POST /admin/courses/:id/publish` |
| Modules | `GET/POST /admin/modules`, `PATCH/DELETE /admin/modules/:id` |
| Lessons | `GET/POST /admin/lessons`, `PATCH/DELETE /admin/lessons/:id`, `POST /admin/lessons/:id/publish` |
| Materials | `GET/POST /admin/materials`, `PATCH/DELETE /admin/materials/:id` |
| Homeworks | `GET/POST /admin/homeworks`, `PATCH/DELETE /admin/homeworks/:id` |
| News | `GET/POST /admin/news`, `PATCH/DELETE /admin/news/:id`, `POST /admin/news/:id/publish` |
| Media | `GET/POST /admin/media`, `DELETE /admin/media/:folder/:filename` |

List endpoints for directions, courses, and news support `search`, `page`, and
`limit`. Courses also support `directionId`.

## Video

The CMS stores only `videoUrl`. Supported providers:

- YouTube;
- Vimeo;
- Cloudflare Stream.

Maestro does not host lesson video.

## Content editor

Lessons, homeworks, and news use lightweight Markdown. The editor supports
headings, bold, italic, lists, links, and images.

## Media Library

Local structure:

```text
uploads/
├── images/
├── pdf/
└── files/
```

Uploads use a single JSON endpoint with `filename`, `mimeType`, and `base64`.
Maximum file size is 20 MB. The API returns a public URL that can be attached
to directions, courses, materials, news Markdown, or lessons.

## Setup

After pulling CMS changes:

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run typecheck
npm run build
npm run dev
```

Then run the CMS scenario:

```bash
npm run cms:smoke
```

The smoke scenario verifies student `403`, creates the full content hierarchy,
publishes it, creates a news post, and confirms the course is visible through
the student catalog API.
