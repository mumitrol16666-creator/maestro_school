import { prisma } from "../../../infrastructure/database/prisma.js";
import { listPreparedTestTemplates } from "../../../domain/prepared-tests.js";
import {
  PREPARED_TEST_PASSING_SCORE,
  bestPreparedTestScore,
  hasPassedPreparedTest,
  preparedTestDailyState,
} from "../../../domain/prepared-test-progress.js";
import { descriptionPreview, withTaskState, type UnifiedTask } from "../../../domain/unified-task.js";

type Attempt = { testId: string; score: number; passed: boolean; createdAt: Date };
type Template = ReturnType<typeof listPreparedTestTemplates>[number];

/**
 * Plan 2.3: the theory tests in the student's task list. One current test is a task: the one
 * started today, otherwise the first one not passed yet. Passed tests are completed tasks.
 * When today's test is done (or its attempts are used up) nothing new is offered until tomorrow.
 */
export function mapTheoryTasks(templates: Template[], attempts: Attempt[], now = new Date()): UnifiedTask[] {
  const task = (template: Template, status: UnifiedTask["status"], actionLabel: string) => withTaskState({
    id: `theory:${template.id}`,
    source: "theory",
    provenance: "prepared_test",
    kind: "test",
    title: template.title,
    descriptionPreview: descriptionPreview(template.description),
    status,
    context: {
      primary: "Теория",
      secondary: `${template.questions.length} вопросов · зачёт от ${PREPARED_TEST_PASSING_SCORE}%`,
      teacherName: null,
    },
    timing: { assignedAt: null, dueAt: null, dueKind: null, overdue: false },
    result: { completionPercent: null, scorePercent: bestPreparedTestScore(attempts, template.id), reviewComment: null, points: null, coins: null },
    target: { href: `/tests/${encodeURIComponent(template.id)}`, actionLabel },
    updatedAt: (attempts.find((attempt) => attempt.testId === template.id)?.createdAt ?? now).toISOString(),
  }, now);

  const completed = templates
    .filter((template) => hasPassedPreparedTest(attempts, template.id))
    .map((template) => task(template, "completed", "Посмотреть разбор"));

  const daily = templates.length ? preparedTestDailyState(attempts, templates[0]!.id, now) : null;
  const todays = daily?.activeTestIdToday ? templates.find((template) => template.id === daily.activeTestIdToday) ?? null : null;
  let current: UnifiedTask | null = null;
  if (todays) {
    const state = preparedTestDailyState(attempts, todays.id, now);
    if (!hasPassedPreparedTest(attempts, todays.id) && state.attemptsRemaining > 0) {
      current = task(todays, "needs_revision", "Повторить тест");
    }
  } else {
    const next = templates.find((template) => !hasPassedPreparedTest(attempts, template.id));
    if (next) current = task(next, "todo", "Пройти тест");
  }
  return [...(current ? [current] : []), ...completed];
}

export async function loadTheoryTasks(studentId: string, now = new Date()) {
  const attempts = await prisma.preparedTestAttempt.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: { testId: true, score: true, passed: true, createdAt: true },
  });
  return mapTheoryTasks(listPreparedTestTemplates(), attempts, now);
}
