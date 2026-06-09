# Maestro Student Portal

Student portal connected to Maestro REST API.

## Scope

- JWT login through backend;
- reusable portal layout;
- API-driven dashboard, courses, lessons, progress, news, and profile;
- lesson start and homework submission actions;
- shared loading, error, and empty states.
- separate `/admin` Education CMS for Admin and Owner.

Payment, scheduling, chat, and student homework file upload are not included.
The Admin CMS includes a local Media Library for content files.

## Run

```bash
npm install
npm run typecheck
npm run dev
```

Create `.env.local` from `.env.example` before running.

See `INTEGRATION.md` for connected endpoints and integration details.
