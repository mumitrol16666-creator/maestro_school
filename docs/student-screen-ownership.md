# Student screen ownership

One full screen has one canonical location. Other sections may show a short
summary and link to it; they must not reproduce its list, filters or editing UI.

| Section | Responsibility | Canonical routes |
| --- | --- | --- |
| Home | Short next-action summary and links | /dashboard |
| Learning | Topics, learning plan, assignments and results | /learning, /monthly-plan, /tasks, /progress |
| Schedule | Calendar, lesson dates/place, attendance and lesson reports | /school-lessons |
| Messages | Conversations | /messages |
| Shop | Rewards and redemption | /rewards |
| Profile | Personal data, settings, memberships and payment | /settings |

## Boundaries implemented in this change

- Schedule has Calendar and Past lessons; no separate Overview or Homework tab.
- No current-plan/progress dashboard or memberships screen inside Schedule.
- The task list is /tasks. School assignment details, materials and submission
  have one location: /tasks/school/[id].
- The ID can identify a V2 assignment or a legacy CRM lesson. For a lesson linked
  to V2 assignments, show those assignments, not a second legacy copy.
- Existing /school-lessons?tab=homework links redirect to /tasks?source=offline.
  A lesson parameter is preserved as /tasks/school/[id].
- Lesson reports link to assignments; they do not repeat the homework text/form.
- Membership details are in Profile, with the existing amounts and remaining
  lesson counts; no billing formulas were changed.

## Regression checks

web_app/e2e/student-lessons-overview.spec.ts uses isolated API fixtures with
production V2 navigation flags. It verifies screen boundaries, legacy links,
submission, calendar/timezones, history/report selection, profile amounts and
responsive widths. It does not validate live production data or constitute a
complete audit of all other student sections.
