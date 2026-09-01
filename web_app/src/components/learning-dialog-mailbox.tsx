"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Download,
  EyeOff,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Flag,
  Inbox,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Undo2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";
import { learningDialogsApi, notifyLearningDialogsUpdated } from "@/lib/learning-dialogs-api";
import type {
  LearningDialogArchiveFilter,
  LearningDialogAttachment,
  LearningDialogDetail,
  LearningDialogMember,
  LearningDialogMessage,
  LearningDialogSummary,
} from "@/types/learning-dialogs";

type MailboxRole = "student" | "teacher" | "parent" | "admin";

type DialogAction = {
  kind: "start" | "edit" | "report" | "hide" | "resolve" | "dismiss" | "restrict" | "unrestrict";
  title: string;
  confirmLabel: string;
  messageId?: string;
  versionId?: string;
  reportId?: string;
  userId?: string;
  initialValue?: string;
};

const typeLabels = {
  learning_direction: "Обучение",
  parent_teacher: "Родители и преподаватель",
  curator: "Куратор",
  crm_group: "Группа",
} as const;

const MAX_FILES = 5;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_FILES = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/quicktime,video/webm";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Не удалось выполнить действие";
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short" }).format(date);
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-amber-50 text-sm font-black text-amber-800">
      {avatar
        ? <img src={avatar} alt="" className="h-full w-full object-cover" />
        : name.slice(0, 1).toUpperCase() || <UserRound size={17} />}
    </span>
  );
}

function activeMembers(members: LearningDialogMember[]) {
  return members.filter((member) => !member.leftAt);
}

function counterpart(
  conversation: Pick<LearningDialogSummary, "type" | "title" | "members">,
  userId: string | undefined,
  role: MailboxRole,
) {
  const members = activeMembers(conversation.members);
  if (conversation.type === "curator") return { name: "Куратор", avatar: null };
  if (conversation.type === "crm_group") return { name: conversation.title || "Учебная группа", avatar: null };
  const preferred = conversation.type === "learning_direction" && role === "admin"
    ? members.find((member) => member.role === "student")
    : conversation.type === "parent_teacher"
    ? role === "parent"
      ? members.find((member) => member.role === "teacher")
      : members.find((member) => member.role === "parent")
    : members.find((member) => member.userId !== userId && member.role !== "curator");
  return {
    name: preferred?.name || conversation.title || "Учебный диалог",
    avatar: preferred?.avatar ?? null,
  };
}

function messagePreview(message: LearningDialogSummary["lastMessage"]) {
  if (!message) return "Диалог готов к общению";
  if (message.state === "retracted") return "Сообщение отозвано";
  if (message.state === "hidden") return "Сообщение скрыто";
  if (message.body) return message.body;
  return message.attachments.length === 1 ? "Файл" : `Файлов: ${message.attachments.length}`;
}

function attachmentIcon(attachment: LearningDialogAttachment) {
  if (attachment.mimeType.startsWith("image/")) return FileImage;
  if (attachment.mimeType.startsWith("video/")) return FileVideo;
  if (attachment.mimeType.startsWith("audio/")) return FileAudio;
  return FileText;
}

function canChange(message: LearningDialogMessage) {
  return Boolean(
    message.mine
    && message.state === "visible"
    && Date.now() - new Date(message.createdAt).getTime() <= 15 * 60 * 1000,
  );
}

function ActionDialog({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: DialogAction;
  busy: boolean;
  onClose: () => void;
  onConfirm: (value: string, durationHours: number) => void;
}) {
  const [value, setValue] = useState(action.initialValue ?? "");
  const [durationHours, setDurationHours] = useState(24);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="dialog-action-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">Диалог Maestro</p>
            <h2 id="dialog-action-title" className="mt-1 text-xl font-black text-ink">{action.title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 text-stone-500" aria-label="Закрыть">
            <X size={17} />
          </button>
        </header>
        <div className="p-5">
          {action.kind === "restrict" ? (
            <label className="mb-4 block">
              <span className="text-xs font-bold text-stone-600">Срок ограничения</span>
              <select value={durationHours} onChange={(event) => setDurationHours(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-gold">
                <option value={1}>1 час</option>
                <option value={24}>24 часа</option>
                <option value={168}>7 дней</option>
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="text-xs font-bold text-stone-600">
              {action.kind === "edit" || action.kind === "start" ? "Сообщение" : "Причина"}
            </span>
            <textarea
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={action.kind === "edit" || action.kind === "start" ? 5 : 4}
              maxLength={action.kind === "edit" || action.kind === "start" ? 4000 : 2000}
              placeholder={action.kind === "edit" || action.kind === "start" ? "Напишите сообщение" : "Кратко опишите причину"}
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-6 outline-none focus:border-gold"
            />
          </label>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-lg border border-stone-200 text-sm font-bold text-stone-600">Отмена</button>
            <button
              type="button"
              onClick={() => onConfirm(value.trim(), durationHours)}
              disabled={busy || !value.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
              {action.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function LearningDialogMailbox({ role }: { role: MailboxRole }) {
  const { user } = useAuth();
  const admin = role === "admin";
  const [archiveFilter, setArchiveFilter] = useState<LearningDialogArchiveFilter>("active");
  const [conversations, setConversations] = useState<LearningDialogSummary[]>([]);
  const [active, setActive] = useState<LearningDialogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [action, setAction] = useState<DialogAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [queryHandled, setQueryHandled] = useState(false);
  const mailboxRef = useRef<HTMLElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const earlierScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (role === "teacher") await learningDialogsApi.syncTeacher().catch(() => undefined);
      const next = await learningDialogsApi.list(archiveFilter);
      setConversations(next);
      setError("");
      return next;
    } catch (loadError) {
      if (!silent) setError(errorText(loadError));
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, [archiveFilter, role]);

  const openConversation = useCallback(async (conversationId: string, updateUrl = true, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const detail = await learningDialogsApi.detail(conversationId);
      setActive(detail);
      await learningDialogsApi.markRead(conversationId).catch(() => undefined);
      setConversations((current) => current.map((item) => item.id === conversationId
        ? { ...item, unreadCount: 0 }
        : item));
      notifyLearningDialogsUpdated();
      setError("");
      if (updateUrl) window.history.replaceState({}, "", `${window.location.pathname}?conversation=${conversationId}`);
    } catch (openError) {
      if (!silent) setError(errorText(openError));
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    setActive(null);
    setQueryHandled(false);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (loading || queryHandled) return;
    const conversationId = new URLSearchParams(window.location.search).get("conversation");
    if (conversationId) void openConversation(conversationId, false);
    setQueryHandled(true);
  }, [loading, openConversation, queryHandled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadList(true);
      if (active?.id && !sending && !action) void openConversation(active.id, false, true);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [action, active?.id, loadList, openConversation, sending]);

  useLayoutEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !active) return;
    const earlierScroll = earlierScrollRef.current;
    if (earlierScroll) {
      viewport.scrollTop = viewport.scrollHeight - earlierScroll.scrollHeight + earlierScroll.scrollTop;
      earlierScrollRef.current = null;
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active?.id, active?.messages.length]);

  useEffect(() => {
    const mailbox = mailboxRef.current;
    const mobile = window.matchMedia("(max-width: 767px)");
    if (!active || !mailbox || !mobile.matches) return;

    const visualViewport = window.visualViewport;
    let viewportFrame = 0;
    let bottomFrame = 0;
    let settleTimer = 0;
    const scrollToLatestMessage = () => {
      window.cancelAnimationFrame(bottomFrame);
      window.clearTimeout(settleTimer);
      bottomFrame = window.requestAnimationFrame(() => {
        const messages = messagesViewportRef.current;
        if (!messages) return;
        messages.scrollTop = messages.scrollHeight;
        bottomFrame = window.requestAnimationFrame(() => {
          if (messagesViewportRef.current) {
            messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
          }
        });
      });
      settleTimer = window.setTimeout(() => {
        if (messagesViewportRef.current) {
          messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
        }
      }, 180);
    };
    const updateViewport = (keepLatestMessageVisible = false) => {
      const shouldKeepLatest = keepLatestMessageVisible || document.activeElement === composerRef.current;
      window.cancelAnimationFrame(viewportFrame);
      viewportFrame = window.requestAnimationFrame(() => {
        const width = visualViewport?.width ?? window.innerWidth;
        const height = visualViewport?.height ?? window.innerHeight;
        const left = visualViewport?.offsetLeft ?? 0;
        const top = visualViewport?.offsetTop ?? 0;
        mailbox.style.setProperty("--maestro-dialog-viewport-width", `${width}px`);
        mailbox.style.setProperty("--maestro-dialog-viewport-height", `${height}px`);
        mailbox.style.setProperty("--maestro-dialog-viewport-left", `${left}px`);
        mailbox.style.setProperty("--maestro-dialog-viewport-top", `${top}px`);
        if (shouldKeepLatest) scrollToLatestMessage();
      });
    };
    const handleResize = () => updateViewport(true);
    const handleScroll = () => updateViewport(document.activeElement === composerRef.current);

    document.body.classList.add("maestro-dialog-active");
    updateViewport(true);
    visualViewport?.addEventListener("resize", handleResize);
    visualViewport?.addEventListener("scroll", handleScroll);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.cancelAnimationFrame(viewportFrame);
      window.cancelAnimationFrame(bottomFrame);
      window.clearTimeout(settleTimer);
      visualViewport?.removeEventListener("resize", handleResize);
      visualViewport?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("orientationchange", handleResize);
      document.body.classList.remove("maestro-dialog-active");
      mailbox.style.removeProperty("--maestro-dialog-viewport-width");
      mailbox.style.removeProperty("--maestro-dialog-viewport-height");
      mailbox.style.removeProperty("--maestro-dialog-viewport-left");
      mailbox.style.removeProperty("--maestro-dialog-viewport-top");
    };
  }, [active?.id]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    if (!normalized) return conversations;
    return conversations.filter((conversation) => {
      const person = counterpart(conversation, user?.id, role);
      return `${person.name} ${conversation.title ?? ""} ${typeLabels[conversation.type]}`
        .toLocaleLowerCase("ru")
        .includes(normalized);
    });
  }, [conversations, query, role, user?.id]);

  function closeThread() {
    setActive(null);
    setDraft("");
    setFiles([]);
    setMembersOpen(false);
    window.history.replaceState({}, "", window.location.pathname);
  }

  async function reloadActive() {
    if (!active) return;
    await Promise.all([openConversation(active.id, false), loadList(true)]);
  }

  async function changePreferences(input: { notificationsMuted?: boolean; archived?: boolean }) {
    if (!active) return;
    try {
      await learningDialogsApi.preferences(active.id, input);
      if (input.archived !== undefined) {
        closeThread();
        await loadList();
      } else {
        setActive((current) => current ? { ...current, notificationsMuted: Boolean(input.notificationsMuted) } : current);
        setConversations((current) => current.map((item) => item.id === active.id
          ? { ...item, notificationsMuted: Boolean(input.notificationsMuted) }
          : item));
      }
      notifyLearningDialogsUpdated();
    } catch (preferenceError) {
      setError(errorText(preferenceError));
    }
  }

  function selectFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)].slice(0, MAX_FILES);
    const oversized = next.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setError(`${oversized.name}: файл больше 50 MB`);
      return;
    }
    setFiles(next);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendMessage() {
    if (!active || sending || (!draft.trim() && files.length === 0)) return;
    setSending(true);
    try {
      await learningDialogsApi.send(active.id, { message: draft, files });
      setDraft("");
      setFiles([]);
      await reloadActive();
      notifyLearningDialogsUpdated();
    } catch (sendError) {
      setError(errorText(sendError));
    } finally {
      setSending(false);
    }
  }

  async function loadEarlier() {
    if (!active?.nextCursor) return;
    const viewport = messagesViewportRef.current;
    earlierScrollRef.current = viewport
      ? { scrollHeight: viewport.scrollHeight, scrollTop: viewport.scrollTop }
      : null;
    setThreadLoading(true);
    try {
      const earlier = await learningDialogsApi.detail(active.id, active.nextCursor);
      setActive((current) => current ? {
        ...current,
        messages: [...earlier.messages, ...current.messages],
        nextCursor: earlier.nextCursor,
      } : current);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setThreadLoading(false);
    }
  }

  async function executeAction(value: string, durationHours: number) {
    if (!action) return;
    setActionBusy(true);
    try {
      if (action.kind === "start") {
        const result = await learningDialogsApi.startCurator(value);
        setAction(null);
        await loadList(true);
        await openConversation(result.conversationId);
        notifyLearningDialogsUpdated();
        return;
      }
      if (!active) return;
      if (action.kind === "edit" && action.messageId) {
        await learningDialogsApi.edit(active.id, action.messageId, value);
      }
      if (action.kind === "report" && action.messageId && action.versionId) {
        await learningDialogsApi.report(active.id, action.messageId, action.versionId, value);
      }
      if (action.kind === "hide" && action.messageId) {
        await learningDialogsApi.hide(active.id, action.messageId, value);
      }
      if ((action.kind === "resolve" || action.kind === "dismiss") && action.reportId) {
        await learningDialogsApi.resolveReport(active.id, action.reportId, action.kind === "resolve" ? "resolved" : "dismissed", value);
      }
      if (action.kind === "restrict" && action.userId) {
        const until = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
        await learningDialogsApi.restrict(active.id, action.userId, until, value);
      }
      if (action.kind === "unrestrict" && action.userId) {
        await learningDialogsApi.unrestrict(active.id, action.userId, value);
      }
      setAction(null);
      await reloadActive();
      notifyLearningDialogsUpdated();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setActionBusy(false);
    }
  }

  async function retractMessage(messageId: string) {
    if (!active) return;
    setSending(true);
    try {
      await learningDialogsApi.retract(active.id, messageId);
      await reloadActive();
      notifyLearningDialogsUpdated();
    } catch (retractError) {
      setError(errorText(retractError));
    } finally {
      setSending(false);
    }
  }

  const activePerson = active ? counterpart(active, user?.id, role) : null;

  return (
    <>
      <section
        ref={mailboxRef}
        className={`learning-dialog-mailbox h-[calc(100dvh-315px)] min-h-[320px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft sm:h-[calc(100dvh-295px)] sm:min-h-[420px] lg:h-[calc(100dvh-230px)] lg:min-h-[650px] ${role === "admin" ? "" : "learning-dialog-mailbox--with-mobile-navigation"} ${active ? "learning-dialog-mailbox--active" : ""}`}
        data-testid="learning-dialog-mailbox"
        data-mobile-thread-active={active ? "true" : undefined}
      >
        <div className="grid h-full min-h-0 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className={`${active ? "hidden md:flex" : "flex"} min-w-0 flex-col border-stone-200 md:border-r`}>
            <div className="border-b border-stone-200 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 rounded-lg bg-stone-100 p-1" aria-label="Папка диалогов">
                  {(["active", "archived"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setArchiveFilter(value)}
                      className={`h-9 rounded-md text-xs font-bold transition ${archiveFilter === value ? "bg-white text-ink shadow-sm" : "text-stone-500"}`}
                    >
                      {value === "active" ? "Диалоги" : "Архив"}
                    </button>
                  ))}
                </div>
                {role === "student" && archiveFilter === "active" ? (
                  <button
                    type="button"
                    onClick={() => setAction({ kind: "start", title: "Написать куратору", confirmLabel: "Отправить" })}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ink text-white"
                    aria-label="Написать куратору"
                    title="Написать куратору"
                  >
                    <MessageSquarePlus size={18} />
                  </button>
                ) : (
                  <button type="button" onClick={() => void loadList()} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-500" aria-label="Обновить диалоги" title="Обновить">
                    <RefreshCw size={17} />
                  </button>
                )}
              </div>
              <label className="relative mt-3 block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск" className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-3 text-sm outline-none focus:border-gold" />
              </label>
            </div>

            {error && !active ? (
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
                <span>{error}</span><button type="button" onClick={() => setError("")} className="grid h-6 w-6 shrink-0 place-items-center rounded" aria-label="Закрыть ошибку"><X size={14} /></button>
              </div>
            ) : null}

            {loading ? (
              <div className="grid flex-1 place-items-center"><LoaderCircle size={24} className="animate-spin text-gold" /></div>
            ) : filtered.length ? (
              <div data-testid="learning-dialog-list" className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto overscroll-contain">
                {filtered.map((conversation) => {
                  const person = counterpart(conversation, user?.id, role);
                  return (
                    <button
                      key={conversation.id}
                      data-testid="learning-dialog-row"
                      type="button"
                      onClick={() => void openConversation(conversation.id)}
                      className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition hover:bg-stone-50 sm:px-4"
                    >
                      <Avatar name={person.name} avatar={person.avatar} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <strong className="min-w-0 flex-1 truncate text-sm text-ink">{person.name}</strong>
                          <span className="shrink-0 text-[10px] text-stone-400">{formatTime(conversation.lastMessageAt)}</span>
                        </span>
                        <span className="mt-1 flex items-center gap-1.5">
                          <span className={`min-w-0 flex-1 truncate text-xs ${conversation.unreadCount ? "font-bold text-ink" : "text-stone-500"}`}>{messagePreview(conversation.lastMessage)}</span>
                          {conversation.notificationsMuted ? <BellOff size={12} className="shrink-0 text-stone-400" /> : null}
                          {conversation.openReportCount > 0 ? <ShieldAlert size={13} className="shrink-0 text-rose-600" /> : null}
                          {conversation.unreadCount > 0 ? (
                            <span className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1 text-[10px] font-black text-ink">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate text-[10px] font-bold uppercase text-stone-400">{typeLabels[conversation.type]}</span>
                      </span>
                      <ChevronRight size={15} className="shrink-0 text-stone-300 md:hidden" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <Inbox size={28} className="mx-auto text-stone-300" />
                  <p className="mt-3 font-bold text-ink">{archiveFilter === "archived" ? "Архив пуст" : "Диалогов пока нет"}</p>
                </div>
              </div>
            )}
          </aside>

          <div className={`${active || threadLoading ? "flex" : "hidden md:flex"} h-full min-h-0 min-w-0 flex-col overflow-hidden bg-stone-50/60`}>
            {threadLoading && !active ? (
              <div className="grid flex-1 place-items-center"><LoaderCircle size={26} className="animate-spin text-gold" /></div>
            ) : active && activePerson ? (
              <>
                <header data-testid="learning-dialog-active-header" className="flex min-h-[68px] shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top,0px))] sm:px-4 sm:py-2.5">
                  <button type="button" onClick={closeThread} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 md:hidden" aria-label="К списку диалогов"><ArrowLeft size={18} /></button>
                  <Avatar name={activePerson.name} avatar={activePerson.avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{activePerson.name}</p>
                    <p className="truncate text-[11px] text-stone-500">{typeLabels[active.type]}{active.status !== "active" ? " · Только чтение" : ""}</p>
                  </div>
                  <button type="button" onClick={() => setMembersOpen((value) => !value)} className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${membersOpen ? "border-gold bg-amber-50 text-amber-800" : "border-stone-200 text-stone-500"}`} aria-label="Участники диалога" title="Участники"><UsersRound size={17} /></button>
                  <button type="button" onClick={() => void changePreferences({ notificationsMuted: !active.notificationsMuted })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-500" aria-label={active.notificationsMuted ? "Включить уведомления" : "Отключить уведомления"} title={active.notificationsMuted ? "Включить уведомления" : "Отключить уведомления"}>{active.notificationsMuted ? <BellOff size={17} /> : <Bell size={17} />}</button>
                  <button type="button" onClick={() => void changePreferences({ archived: !active.archivedAt })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-500" aria-label={active.archivedAt ? "Вернуть из архива" : "В архив"} title={active.archivedAt ? "Вернуть из архива" : "В архив"}>{active.archivedAt ? <ArchiveRestore size={17} /> : <Archive size={17} />}</button>
                </header>

                {membersOpen ? (
                  <section className="shrink-0 border-b border-stone-200 bg-white px-4 py-3" aria-label="Участники">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {activeMembers(active.members).map((member) => {
                        const restricted = Boolean(member.restrictedUntil && new Date(member.restrictedUntil).getTime() > Date.now());
                        return (
                          <div key={member.userId} className="flex min-w-[190px] items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
                            <Avatar name={member.name} avatar={member.avatar} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-ink">{member.name}</p>
                              <p className={`mt-0.5 text-[10px] ${restricted ? "font-bold text-rose-600" : "text-stone-400"}`}>{restricted ? "Отправка ограничена" : member.role === "teacher" ? "Преподаватель" : member.role === "parent" ? "Родитель" : member.role === "student" ? "Ученик" : "Куратор"}</p>
                            </div>
                            {admin && active.type === "crm_group" && member.role !== "curator" ? (
                              <button
                                type="button"
                                onClick={() => setAction({
                                  kind: restricted ? "unrestrict" : "restrict",
                                  title: restricted ? "Снять ограничение" : "Ограничить отправку",
                                  confirmLabel: restricted ? "Разрешить" : "Ограничить",
                                  userId: member.userId,
                                })}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-stone-200 text-stone-500"
                                aria-label={restricted ? `Разрешить отправку: ${member.name}` : `Ограничить отправку: ${member.name}`}
                                title={restricted ? "Разрешить отправку" : "Ограничить отправку"}
                              >
                                {restricted ? <Check size={14} /> : <ShieldAlert size={14} />}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <div ref={messagesViewportRef} data-testid="learning-dialog-messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] sm:px-6">
                  {active.nextCursor ? (
                    <div className="text-center"><button type="button" onClick={() => void loadEarlier()} disabled={threadLoading} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600">Ранние сообщения</button></div>
                  ) : null}
                  {active.messages.length ? active.messages.map((message) => {
                    const stateText = message.state === "retracted" ? "Сообщение отозвано" : message.state === "hidden" ? "Сообщение скрыто администратором" : null;
                    const changeAllowed = canChange(message);
                    return (
                      <article key={message.id} className={`group flex ${message.mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[90%] sm:max-w-[76%] ${message.mine ? "items-end" : "items-start"} flex flex-col`}>
                          {!message.mine && message.authorName ? <p className="mb-1 px-1 text-[10px] font-bold text-stone-500">{message.authorName}</p> : null}
                          <div className={`min-w-0 rounded-2xl px-3.5 py-2.5 ${message.mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-stone-200 bg-white text-ink"}`}>
                            {stateText ? <p className={`text-sm italic ${message.mine ? "text-white/55" : "text-stone-400"}`}>{stateText}</p> : null}
                            {message.body ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p> : null}
                            {message.contextType && message.contextId ? (
                              <p className={`mt-2 text-[10px] font-bold uppercase ${message.mine ? "text-gold" : "text-amber-700"}`}>Контекст: {message.contextType}</p>
                            ) : null}
                            {message.attachments.length ? (
                              <div className="mt-2 space-y-1.5">
                                {message.attachments.map((attachment) => {
                                  const Icon = attachmentIcon(attachment);
                                  return (
                                    <button
                                      key={attachment.id}
                                      type="button"
                                      onClick={() => void learningDialogsApi.download(attachment.id, attachment.originalFilename).catch((downloadError) => setError(errorText(downloadError)))}
                                      className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${message.mine ? "border-white/15 bg-white/10" : "border-stone-200 bg-stone-50"}`}
                                    >
                                      <Icon size={16} className="shrink-0" />
                                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{attachment.originalFilename}</span>
                                      <span className={`shrink-0 text-[10px] ${message.mine ? "text-white/45" : "text-stone-400"}`}>{formatBytes(attachment.sizeBytes)}</span>
                                      <Download size={14} className="shrink-0" />
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                            <p className={`mt-1.5 text-right text-[10px] ${message.mine ? "text-white/45" : "text-stone-400"}`}>{message.editedAt ? "изменено · " : ""}{formatMessageTime(message.createdAt)}</p>
                          </div>

                          {message.state === "visible" ? (
                            <div className={`mt-1 flex flex-wrap gap-1 ${message.mine ? "justify-end" : "justify-start"}`}>
                              {changeAllowed ? (
                                <>
                                  <button type="button" onClick={() => setAction({ kind: "edit", title: "Изменить сообщение", confirmLabel: "Сохранить", messageId: message.id, initialValue: message.body ?? "" })} className="grid h-7 w-7 place-items-center rounded-md text-stone-400 hover:bg-white hover:text-ink" aria-label="Изменить сообщение" title="Изменить"><Pencil size={13} /></button>
                                  <button type="button" onClick={() => void retractMessage(message.id)} className="grid h-7 w-7 place-items-center rounded-md text-stone-400 hover:bg-white hover:text-rose-700" aria-label="Отозвать сообщение" title="Отозвать"><Undo2 size={13} /></button>
                                </>
                              ) : null}
                              {!message.mine && !admin && message.currentVersionId ? (
                                <button type="button" onClick={() => setAction({ kind: "report", title: "Пожаловаться на сообщение", confirmLabel: "Отправить", messageId: message.id, versionId: message.currentVersionId ?? undefined })} className="grid h-7 w-7 place-items-center rounded-md text-stone-400 hover:bg-white hover:text-rose-700" aria-label="Пожаловаться на сообщение" title="Пожаловаться"><Flag size={13} /></button>
                              ) : null}
                              {admin ? (
                                <button type="button" onClick={() => setAction({ kind: "hide", title: "Скрыть сообщение", confirmLabel: "Скрыть", messageId: message.id })} className="grid h-7 w-7 place-items-center rounded-md text-stone-400 hover:bg-white hover:text-rose-700" aria-label="Скрыть сообщение" title="Скрыть"><EyeOff size={13} /></button>
                              ) : null}
                            </div>
                          ) : null}

                          {admin && message.reports?.some((report) => report.status === "open") ? (
                            <div className="mt-2 w-full rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-950">
                              {message.reports.filter((report) => report.status === "open").map((report) => (
                                <div key={report.id} className="border-b border-rose-200 py-2 first:pt-0 last:border-0 last:pb-0">
                                  <p className="text-xs font-bold">Жалоба{report.reporterName ? ` · ${report.reporterName}` : ""}</p>
                                  <p className="mt-1 text-xs leading-5 text-rose-800">{report.reason}</p>
                                  <div className="mt-2 flex gap-2">
                                    <button type="button" onClick={() => setAction({ kind: "resolve", title: "Решить жалобу", confirmLabel: "Решить", reportId: report.id })} className="rounded-md bg-ink px-2.5 py-1.5 text-[10px] font-bold text-white">Решить</button>
                                    <button type="button" onClick={() => setAction({ kind: "dismiss", title: "Отклонить жалобу", confirmLabel: "Отклонить", reportId: report.id })} className="rounded-md border border-rose-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-800">Отклонить</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="grid h-full min-h-48 place-items-center text-center">
                      <div><MessageCircle size={28} className="mx-auto text-stone-300" /><p className="mt-3 text-sm font-bold text-ink">Начните переписку</p></div>
                    </div>
                  )}
                </div>

                {error ? (
                  <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-t border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
                    <span>{error}</span><button type="button" onClick={() => setError("")} className="grid h-6 w-6 shrink-0 place-items-center rounded" aria-label="Закрыть ошибку"><X size={14} /></button>
                  </div>
                ) : null}

                <footer data-testid="learning-dialog-composer" className="z-10 shrink-0 border-t border-stone-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_28px_rgba(28,25,23,0.06)] sm:p-4">
                  {active.canWrite ? (
                    <>
                      {files.length ? (
                        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                          {files.map((file, index) => (
                            <span key={`${file.name}-${index}`} className="inline-flex max-w-[230px] shrink-0 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs font-semibold">
                              <Paperclip size={13} className="shrink-0 text-gold" /><span className="min-w-0 truncate">{file.name}</span>
                              <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-5 w-5 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-200" aria-label={`Убрать ${file.name}`}><X size={12} /></button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-end gap-2">
                        <input ref={fileInputRef} data-testid="learning-dialog-file-input" type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(event) => selectFiles(event.target.files)} />
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending || files.length >= MAX_FILES} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 disabled:opacity-35" aria-label="Прикрепить фото, видео или файл" title="Прикрепить фото, видео или файл"><Paperclip size={18} /></button>
                        <textarea
                          ref={composerRef}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onFocus={() => {
                            const messages = messagesViewportRef.current;
                            if (messages) messages.scrollTop = messages.scrollHeight;
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          rows={1}
                          maxLength={4000}
                          placeholder="Сообщение"
                          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm outline-none focus:border-gold"
                        />
                        <button type="button" onClick={() => void sendMessage()} disabled={sending || (!draft.trim() && files.length === 0)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gold text-ink disabled:opacity-35" aria-label="Отправить сообщение">{sending ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}</button>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-500"><Archive size={16} className="shrink-0" />Диалог доступен только для чтения</div>
                  )}
                </footer>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div><MessageCircle size={32} className="mx-auto text-stone-300" /><p className="mt-3 font-bold text-ink">Выберите диалог</p></div>
              </div>
            )}
          </div>
        </div>
      </section>

      {action ? <ActionDialog action={action} busy={actionBusy} onClose={() => setAction(null)} onConfirm={(value, hours) => void executeAction(value, hours)} /> : null}
    </>
  );
}
