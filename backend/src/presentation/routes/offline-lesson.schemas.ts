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
