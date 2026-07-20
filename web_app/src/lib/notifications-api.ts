import { apiRequest } from "@/lib/api-client";

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  unreadCount: (type?: "online_lesson_scheduled" | "offline_lesson_approved" | "direct_message_received") =>
    apiRequest<{ count: number }>(
      `/students/me/notifications/unread-count${type ? `?type=${encodeURIComponent(type)}` : ""}`,
    ),
  list: (limit = 20) => apiRequest<UserNotification[]>(`/students/me/notifications?limit=${limit}`),
  markRead: (id: string) =>
    apiRequest(`/students/me/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: (type?: "online_lesson_scheduled" | "offline_lesson_approved" | "direct_message_received") =>
    apiRequest(
      `/students/me/notifications/read-all${type ? `?type=${encodeURIComponent(type)}` : ""}`,
      { method: "POST" },
    ),
};
