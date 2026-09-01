import { z } from "zod";

export const offlineLessonStudentCheckSchema = z.object({
  studentId: z.string().min(1),
  attended: z.boolean().optional(),
  attendanceStatus: z.enum([
    "unmarked",
    "present",
    "late",
    "excused_absence",
    "unexcused_absence",
  ]),
  teacherNote: z.string().max(3000).optional(),
  lessonPoints: z.number().int().min(0).max(100).optional(),
  monthlyPlanId: z.string().uuid().nullable().optional(),
  planTopicUpdates: z.array(z.object({
    itemId: z.string().min(1).max(100),
    status: z.enum(["in_progress", "completed"]),
  })).max(50).optional(),
  homeworkReview: z.object({
    sourceCrmClassId: z.string().min(1).max(128).nullable().optional(),
    status: z.enum(["not_checked", "completed", "partial", "not_completed", "not_assigned"]),
    completionPercent: z.number().int().min(0).max(100).nullable().optional(),
    difficulties: z.string().max(3000).nullable().optional(),
    notCompletedReason: z.string().max(3000).nullable().optional(),
  }).superRefine((review, context) => {
    if (review.status === "not_completed" && !review.notCompletedReason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notCompletedReason"],
        message: "Укажите причину невыполненного домашнего задания",
      });
    }
  }).optional(),
}).superRefine((check, context) => {
  const ids = (check.planTopicUpdates ?? []).map((item) => item.itemId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["planTopicUpdates"],
      message: "Одна тема плана указана несколько раз",
    });
  }
});

export const learningLessonResultsSchema = z.object({
  homeworkDecisions: z.array(z.object({
    recipientId: z.string().uuid(),
    cycleNumber: z.number().int().min(1),
    decision: z.enum(["revision", "accepted", "accepted_with_comment"]),
    comment: z.string().max(5000).nullable().optional(),
  }).superRefine((decision, context) => {
    if (
      ["revision", "accepted_with_comment"].includes(decision.decision)
      && !decision.comment?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "Для этого решения нужен комментарий",
      });
    }
  })).max(50).default([]),
  topicUpdates: z.array(z.object({
    topicId: z.string().uuid(),
    expectedPercent: z.number().int().min(0).max(100).nullable(),
    toPercent: z.number().int().min(0).max(100),
    comment: z.string().max(5000).nullable().optional(),
  })).max(20).default([]),
});
