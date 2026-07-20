import { apiRequest } from "@/lib/api-client";
import type {
  DirectMessage,
  MessageContact,
  MessageConversation,
  MessageConversationSummary,
} from "@/types/messages";

export const messagesApi = {
  contacts: () => apiRequest<MessageContact[]>("/messages/contacts"),
  conversations: () => apiRequest<MessageConversationSummary[]>("/messages"),
  unreadCount: () => apiRequest<{ count: number }>("/messages/unread-count"),
  conversation: (id: string) => apiRequest<MessageConversation>(`/messages/${id}`),
  start: (recipientId: string, message: string) =>
    apiRequest<{ conversationId: string; message: DirectMessage & { mine: true } }>(
      "/messages/conversations",
      {
        method: "POST",
        body: JSON.stringify({ recipientId, message }),
      },
    ),
  reply: (conversationId: string, message: string) =>
    apiRequest<DirectMessage & { mine: true }>(`/messages/${conversationId}`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};

export function notifyMessagesUpdated() {
  window.dispatchEvent(new CustomEvent("maestro:messages-updated"));
}
