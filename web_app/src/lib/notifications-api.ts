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
  | "direct_message_received"
  | "homework_submitted"
  | "homework_reviewed"
  | "lesson_question_received"
  | "lesson_question_answered"
  | "achievement_earned"
  | "points_awarded"
  | "coins_awarded";

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
