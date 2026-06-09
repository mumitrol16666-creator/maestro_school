# Maestro Learning Engine

Образовательное ядро поверх backend foundation. UI не затрагивается.

## State machine уроков

```text
LOCKED ──(prev completed)──► AVAILABLE
AVAILABLE ──(student opens)──► IN_PROGRESS
IN_PROGRESS ──(homework sent)──► SUBMITTED
SUBMITTED ──(admin reviews)──► REVIEWED (optional)
SUBMITTED|REVIEWED ──(approve)──► COMPLETED + points + unlock next
SUBMITTED|REVIEWED ──(reject)──► AVAILABLE
```

Реализация: `src/domain/lesson-progress.state-machine.ts`

## Сервисы

| Сервис | Файл | Назначение |
|--------|------|------------|
| Lesson unlock | `lesson-unlock.service.ts` | Правило №1 открыт; next после COMPLETED |
| Lesson progress | `lesson-progress.service.ts` | start, submit, complete, revision |
| Homework submit | `homework-submit.service.ts` | Отправка ДЗ → SUBMITTED |
| Homework review | `homework-review.service.ts` | Admin approve/reject |
| Course progress | `course-progress.service.ts` | % курса, модуль/курс completed |
| Points | `points.service.ts` | `calculateStudentPoints()`, award |
| Dashboard | `student-dashboard.service.ts` | Данные главной ученика |
| Achievements | `achievement.service.ts` | Проверка и выдача достижений |

## API (новые / обновлённые)

| Method | Endpoint | Role |
|--------|----------|------|
| POST | `/api/v1/lessons/:lessonId/start` | Student |
| GET | `/api/v1/students/me/dashboard` | Student |
| GET | `/api/v1/students/me/progress` | Student (+ courseProgressPercent) |
| POST | `/api/v1/homeworks/:homeworkId/submissions` | Student → SUBMITTED |
| PATCH | `/api/v1/homeworks/submissions/:submissionId/review` | Admin |

### Review body

```json
{ "action": "approve", "reviewNote": "Отлично!" }
{ "action": "reject", "reviewNote": "Переделайте бой" }
```

## Баллы

- Баланс: `calculateStudentPoints()` = `SUM(points_transactions.amount)`
- Начисление при approve: `lesson.pointsReward`, idempotent по `(studentId, lessonId)`
- История: `lessonId`, `reason`, `awardedBy`, `createdAt`

## Достижения

Сущности: `Achievement`, `StudentAchievement`.

Критерии: `first_lesson_completed`, `points_threshold`, `first_module_completed`, `lessons_completed_count`.

Не отображаются в UI — только schema + `evaluateAchievements()`.

## Тесты

```bash
npm test
```

Покрытие: state machine, unlock logic, progress percent.
