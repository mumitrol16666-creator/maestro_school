export type LearningDialogType = "learning_direction" | "parent_teacher" | "curator" | "crm_group";
export type LearningDialogStatus = "active" | "read_only" | "closed";
export type LearningDialogMessageState = "visible" | "retracted" | "hidden";
export type LearningDialogArchiveFilter = "active" | "archived";

export type LearningDialogMember = {
  userId: string;
  name: string;
  avatar: string | null;
  role: "student" | "teacher" | "parent" | "curator";
  canWrite: boolean;
  restrictedUntil: string | null;
  restrictionReason: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export type LearningDialogAttachment = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  quarantineStatus: string;
  downloadUrl: string;
  createdAt: string;
};

export type LearningDialogReport = {
  id: string;
  versionId: string;
  reporterId: string | null;
  reporterName: string | null;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type LearningDialogMessageVersion = {
  id: string;
  version: number;
  kind: "created" | "edited" | "retracted" | "hidden";
  body: string | null;
  createdById: string | null;
  createdAt: string;
};

export type LearningDialogMessage = {
  id: string;
  conversationId?: string;
  authorId: string | null;
  authorName?: string | null;
  mine?: boolean;
  body: string | null;
  currentVersionId: string | null;
  state: LearningDialogMessageState;
  contextType: string | null;
  contextId: string | null;
  editedAt: string | null;
  retractedAt: string | null;
  createdAt: string;
  attachments: LearningDialogAttachment[];
  reports?: LearningDialogReport[];
  versions?: LearningDialogMessageVersion[];
};

export type LearningDialogSummary = {
  id: string;
  type: LearningDialogType;
  status: LearningDialogStatus;
  title: string | null;
  crmDirectionId: string | null;
  crmGroupId: string | null;
  members: LearningDialogMember[];
  lastMessage: LearningDialogMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
  canWrite: boolean;
  notificationsMuted: boolean;
  archivedAt: string | null;
  openReportCount: number;
};

export type LearningDialogDetail = Omit<LearningDialogSummary, "lastMessage" | "lastMessageAt" | "unreadCount" | "openReportCount"> & {
  messages: LearningDialogMessage[];
  moderationActions?: Array<{
    id: string;
    action: string;
    reason: string;
    targetUserId: string | null;
    restrictionUntil: string | null;
    createdAt: string;
  }>;
  nextCursor: string | null;
};
