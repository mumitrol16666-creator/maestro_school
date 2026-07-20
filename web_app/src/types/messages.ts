export type MessageContact = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatar: string | null;
  directions: string[];
  sources: Array<"offline" | "online">;
  conversationId: string | null;
};

export type DirectMessage = {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  mine?: boolean;
};

export type MessagePerson = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatar: string | null;
};

export type MessageConversationSummary = {
  id: string;
  counterpart: MessagePerson;
  lastMessage: DirectMessage | null;
  lastMessageAt: string;
  unreadCount: number;
};

export type MessageConversation = {
  id: string;
  counterpart: MessagePerson;
  messages: Array<DirectMessage & { mine: boolean }>;
};
