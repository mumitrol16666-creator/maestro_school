# Impeccable Init Brief

Status: `DRAFT / NOT A SOURCE OF PRODUCT TRUTH`

This file prepares a future `$impeccable init` interview. It does not replace
`docs/product-map/01-product-constitution.md`, does not authorize a redesign,
and must not be copied into `PRODUCT.md` without product-owner confirmation.

## Confirmed Product Facts

- Platform: web application with PWA support.
- Maestro is the required digital layer of teacher-led music education.
- Courses and tests supplement lessons with a teacher; they do not replace
  that model.
- School and online lessons share one learning model.
- Confirmed roles: student, teacher, one administrative account that also
  performs curator functions, and parent.
- The documented audience includes children aged 10-15, so adult-action
  auditing and student-data protection are mandatory.
- CRM owns directions, students, staff, groups, schedule, subscriptions,
  attendance confirmation, finance, and payroll.
- The application owns plans, topics, homework, submissions, reviews, chats,
  Points, XP, Coins, achievements, and profiles.
- The product must not show invented progress, levels, percentages, or rewards.
- Production stays available while the new model is developed and tested on a
  separate local database.

Primary evidence:

- `docs/product-map/01-product-constitution.md`
- `docs/product-map/02-role-screen-map.md`
- `docs/product-map/03-process-event-map.md`
- `docs/product-map/04-technical-change-map.md`
- `docs/student-application-source-of-truth.md`

## Repository-Evidenced Technical Context

- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS.
- Backend: Fastify, Prisma, PostgreSQL, and JWT.
- Socket.IO is named as an architectural constraint in the setup brief, but no
  active Socket.IO dependency or server implementation was found in the current
  repository. Future work must resolve that discrepancy before treating it as
  implemented infrastructure.
- The student application and CRM remain separate ownership domains connected
  by explicit synchronization rules.

These are implementation facts, not positioning claims.

## Current Visual Evidence

- Tailwind tokens: ink `#181816`, cream `#F5F2EB`, paper `#FCFBF8`, gold
  `#C59A45`, sage `#66715A`.
- Current body typography uses Arial/Helvetica; display typography uses
  Georgia/Times New Roman.
- The implemented interface uses light paper surfaces with ink and gold as the
  main active color. Some screens and loading states also use a dark surface.
- Existing design references are evidence, not a single approved system:
  `web_app/tailwind.config.ts`, `web_app/src/app/globals.css`,
  `docs/student-home-v1-design-spec-2026-08-22.md`, and
  `docs/teacher-workspace-product-policy.md`.
- The student-home visual template explicitly says it is a concept and not an
  implemented design authority.

## Questions Required Before PRODUCT.md

1. Who is the primary user for product-level decisions: the student, the
   teacher, the school administrator, or is Maestro intentionally a multi-role
   school operating system with no single primary role?
2. What category and positioning should Maestro claim externally, and what
   differentiating mechanism can be stated without inventing a promise?
3. What durable success outcome should future product work optimize for?
4. Which product or brand promises are approved for public use, and which must
   remain internal until evidence exists?
5. Is there a required accessibility standard beyond the confirmed child-safety
   and privacy constraints?

## Questions Required Before DESIGN.md

1. Is the currently implemented light paper/ink/gold direction the visual
   identity to preserve, or is it only an interim implementation?
2. Which existing screen is the best approved example of Maestro's intended
   design quality and density?
3. Should staff and student surfaces share one visual system with role-specific
   density, or are they allowed to have distinct visual languages?
4. Which existing logo, icon, font, and image assets are approved brand assets?

## Safe Next Command

After the questions above are answered, run `$impeccable init` to create the
canonical root `PRODUCT.md`. Document the incumbent design separately with
`$impeccable document`; do not run a project-wide polish or redesign during
tooling setup.
