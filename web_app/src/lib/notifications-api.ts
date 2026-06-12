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
  unreadCount: () => apiRequest<{ count: number }>("/students/me/notifications/unread-count"),
  list: (limit = 20) => apiRequest<UserNotification[]>(`/students/me/notifications?limit=${limit}`),
  markRead: (id: string) =>
    apiRequest(`/students/me/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiRequest("/students/me/notifications/read-all", { method: "POST" }),
};
