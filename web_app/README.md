# Maestro Learning Platform Web App

Web application for students, teachers and education administrators.

## Scope

- JWT login through backend;
- reusable portal layout;
- API-driven dashboard, courses, lessons, progress, news, and profile;
- lesson start and homework submission actions;
- shared loading, error, and empty states.
- `/admin` Education CMS for Admin and Owner;
- teacher workspace for offline and online lessons;
- student school schedule and membership summary from CRM;
- online lesson requests, Zoom scheduling and assignments;
- user/role administration and CRM account linking;
- in-app notifications, web push and PWA installation.

Payments remain in Maestro CRM. A general-purpose chat is not included.
Homework attachments are submitted as external links; the Admin CMS includes
a local Media Library for educational content files.

## Run

```bash
npm install
npm run typecheck
npm run dev
```

Create `.env.local` from `.env.example` before running.

See `INTEGRATION.md` for connected endpoints and integration details.
