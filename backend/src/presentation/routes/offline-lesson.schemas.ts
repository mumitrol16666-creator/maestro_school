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
  homeworkReview: z.object({
    status: z.enum(["not_checked", "completed", "partial", "not_completed", "not_assigned"]),
    completionPercent: z.number().int().min(0).max(100).optional(),
    difficulties: z.string().max(3000).optional(),
    notCompletedReason: z.string().max(3000).optional(),
  }).superRefine((review, context) => {
    if (review.status === "not_completed" && !review.notCompletedReason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notCompletedReason"],
        message: "Укажите причину невыполненного домашнего задания",
      });
    }
  }).optional(),
});
