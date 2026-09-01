import { apiRequest } from "@/lib/api-client";

export type UserNotificationType =
  | "online_lesson_assigned"
  | "online_lesson_scheduled"
  | "online_lesson_rescheduled"
  | "online_lesson_cancelled"
  | "online_lesson_no_show"
  | "online_lesson_completed"
  | "online_assignment_submitted"
  | "online_assignment_reviewed"
  | "offline_lesson_approved"
  | "offline_lesson_report_ready"
  | "offline_lesson_returned"
  | "offline_lesson_cancelled"
  | "offline_lesson_rescheduled"
  | "offline_lesson_report_due"
  | "lesson_teacher_reminder"
  | "lesson_student_reminder"
  | "direct_message_received"
  | "homework_assigned"
  | "homework_submitted"
  | "homework_reviewed"
  | "lesson_question_received"
  | "lesson_question_answered"
  | "achievement_earned"
  | "points_awarded"
  | "coins_awarded"
  | "reward_requested"
  | "reward_status_updated"
  | "parent_lesson_reminder"
  | "parent_lesson_report_ready"
  | "parent_schedule_changed"
  | "parent_lesson_cancelled"
  | "parent_absence_alert"
  | "parent_homework_reviewed"
  | "parent_balance_alert"
  | "staff_task_assigned";

export interface UserNotification {
  id: string;
  type: UserNotificationType;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  unreadCount: (type?: UserNotificationType) =>
    apiRequest<{ count: number }>(
      `/students/me/notifications/unread-count${type ? `?type=${encodeURIComponent(type)}` : ""}`,
    ),
  list: (limit = 20) => apiRequest<UserNotification[]>(`/students/me/notifications?limit=${limit}`),
  markRead: (id: string) =>
    apiRequest(`/students/me/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: (type?: UserNotificationType) =>
    apiRequest(
      `/students/me/notifications/read-all${type ? `?type=${encodeURIComponent(type)}` : ""}`,
      { method: "POST" },
    ),
};
