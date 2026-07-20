"use client";

import {
  ArrowLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
  MailPlus,
  MessageCircle,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { ApiError } from "@/lib/api-client";
import { messagesApi, notifyMessagesUpdated } from "@/lib/messages-api";
import type {
  MessageContact,
  MessageConversation,
  MessageConversationSummary,
} from "@/types/messages";

function formatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
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

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Не удалось выполнить действие";
}

function Avatar({
  name,
  avatar,
  size = "normal",
}: {
  name: string;
  avatar: string | null;
  size?: "small" | "normal";
}) {
  const className = size === "small" ? "h-10 w-10 rounded-xl" : "h-12 w-12 rounded-2xl";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden bg-amber-50 font-black text-gold ${className}`}>
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase() || <UserRound size={18} />}
    </span>
  );
}

export function MessageMailbox({ role }: { role: "student" | "teacher" }) {
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [conversations, setConversations] = useState<MessageConversationSummary[]>([]);
  const [active, setActive] = useState<MessageConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContactId, setComposeContactId] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeError, setComposeError] = useState("");
  const [queryHandled, setQueryHandled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMailbox = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextContacts, nextConversations] = await Promise.all([
        messagesApi.contacts(),
        messagesApi.conversations(),
      ]);
      setContacts(nextContacts);
      setConversations(nextConversations);
      setError("");
      return { contacts: nextContacts, conversations: nextConversations };
    } catch (loadError) {
      if (!silent) setError(errorMessage(loadError));
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const openConversation = useCallback(async (conversationId: string, updateUrl = true) => {
    setThreadLoading(true);
    try {
      const conversation = await messagesApi.conversation(conversationId);
      setActive(conversation);
      setConversations((current) => current.map((item) => (
        item.id === conversationId ? { ...item, unreadCount: 0 } : item
      )));
      setError("");
      notifyMessagesUpdated();
      if (updateUrl) {
        window.history.replaceState({}, "", `${window.location.pathname}?conversation=${conversationId}`);
      }
    } catch (openError) {
      setError(errorMessage(openError));
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMailbox();
  }, [loadMailbox]);

  useEffect(() => {
    if (loading || queryHandled) return;
    const query = new URLSearchParams(window.location.search);
    const conversationId = query.get("conversation");
    const contactId = query.get("contact");
    if (conversationId) {
      void openConversation(conversationId, false);
    } else if (contactId) {
      const contact = contacts.find((item) => item.id === contactId);
      if (contact?.conversationId) {
        void openConversation(contact.conversationId);
      } else if (contact) {
        setComposeContactId(contact.id);
        setComposeOpen(true);
      }
    }
    setQueryHandled(true);
  }, [contacts, loading, openConversation, queryHandled]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const result = await loadMailbox(true);
      if (active && result?.conversations.some((item) => item.id === active.id)) {
        await openConversation(active.id, false);
      }
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [active, loadMailbox, openConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, threadLoading]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === composeContactId) ?? null,
    [composeContactId, contacts],
  );

  function closeThread() {
    setActive(null);
    setDraft("");
    window.history.replaceState({}, "", window.location.pathname);
  }

  async function sendReply() {
    const message = draft.trim();
    if (!active || !message || sending) return;
    setSending(true);
    try {
      const sent = await messagesApi.reply(active.id, message);
      setActive((current) => current ? { ...current, messages: [...current.messages, sent] } : current);
      setDraft("");
      await loadMailbox(true);
      notifyMessagesUpdated();
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  async function startNewConversation() {
    const message = composeMessage.trim();
    if (!composeContactId || !message || sending) return;
    setSending(true);
    setComposeError("");
    try {
      const result = await messagesApi.start(composeContactId, message);
      setComposeOpen(false);
      setComposeMessage("");
      setComposeContactId("");
      await loadMailbox(true);
      await openConversation(result.conversationId);
      notifyMessagesUpdated();
    } catch (sendError) {
      setComposeError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState label="Загружаем переписку" />;
  if (error && !conversations.length && !contacts.length) {
    return <ErrorState message={error} retry={() => void loadMailbox()} />;
  }

  return (
    <>
      <section className="h-[calc(100dvh-335px)] min-h-[360px] overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-soft md:h-auto md:min-h-[min(680px,calc(100vh-190px))]">
        <div className="grid h-full md:min-h-[min(680px,calc(100vh-190px))] md:grid-cols-[330px_minmax(0,1fr)]">
          <aside className={`${active ? "hidden md:flex" : "flex"} min-w-0 flex-col border-stone-200 md:border-r`}>
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Переписка</p>
                <p className="mt-1 text-sm font-bold text-ink">
                  {conversations.length ? `Диалогов: ${conversations.length}` : "Пока пусто"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComposeContactId(contacts[0]?.id ?? "");
                  setComposeOpen(true);
                }}
                disabled={!contacts.length}
                className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={role === "student" ? "Создать обращение" : "Новое сообщение"}
                title={role === "student" ? "Создать обращение" : "Новое сообщение"}
              >
                <MailPlus size={18} />
              </button>
            </div>

            {conversations.length ? (
              <div className="divide-y divide-stone-100 overflow-y-auto">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-stone-50"
                  >
                    <Avatar name={conversation.counterpart.name} avatar={conversation.counterpart.avatar} size="small" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{conversation.counterpart.name}</span>
                        <span className="shrink-0 text-[10px] text-stone-400">{formatTime(conversation.lastMessageAt)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-xs ${conversation.unreadCount ? "font-bold text-ink" : "text-stone-500"}`}>
                          {conversation.lastMessage?.body ?? "Диалог создан"}
                        </span>
                        {conversation.unreadCount > 0 ? (
                          <span className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1 text-[10px] font-black text-ink">
                            {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-stone-300 md:hidden" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-7 text-center">
                <div>
                  <Inbox size={30} className="mx-auto text-stone-300" />
                  <p className="mt-4 font-bold text-ink">Сообщений пока нет</p>
                  <p className="mx-auto mt-2 max-w-[230px] text-sm leading-6 text-stone-500">
                    {contacts.length
                      ? role === "student"
                        ? "Создайте обращение, и преподаватель ответит здесь."
                        : "Напишите ученику прямо из приложения."
                      : role === "student"
                        ? "Обращения появятся после назначения преподавателя."
                        : "Ученики с подключённым аккаунтом пока не назначены."}
                  </p>
                  {contacts.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setComposeContactId(contacts[0].id);
                        setComposeOpen(true);
                      }}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-bold text-white"
                    >
                      <MailPlus size={15} />
                      {role === "student" ? "Создать обращение" : "Новое сообщение"}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </aside>

          <div className={`${active || threadLoading ? "flex" : "hidden md:flex"} min-w-0 flex-col bg-stone-50/55`}>
            {threadLoading && !active ? (
              <div className="grid flex-1 place-items-center">
                <LoaderCircle className="animate-spin text-gold" size={28} />
              </div>
            ) : active ? (
              <>
                <header className="flex min-h-[73px] items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={closeThread}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-600 md:hidden"
                    aria-label="К списку диалогов"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <Avatar name={active.counterpart.name} avatar={active.counterpart.avatar} size="small" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{active.counterpart.name}</p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {role === "student" ? "Ваш преподаватель" : "Ученик"}
                    </p>
                  </div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
                  {active.messages.map((message) => (
                    <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[86%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${
                        message.mine
                          ? "rounded-br-md bg-ink text-white"
                          : "rounded-bl-md border border-stone-200 bg-white text-ink"
                      }`}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                        <p className={`mt-1.5 text-right text-[10px] ${message.mine ? "text-white/45" : "text-stone-400"}`}>
                          {formatMessageTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <footer className="border-t border-stone-200 bg-white p-3 sm:p-4">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendReply();
                        }
                      }}
                      rows={1}
                      maxLength={3000}
                      placeholder="Напишите сообщение"
                      className="max-h-36 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-gold/60"
                    />
                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={!draft.trim() || sending}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold text-ink transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Отправить сообщение"
                    >
                      {sending ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <MessageCircle size={34} className="mx-auto text-stone-300" />
                  <p className="mt-4 font-bold text-ink">Выберите диалог</p>
                  <p className="mt-2 text-sm text-stone-500">Сообщения откроются здесь.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {error && (conversations.length || contacts.length) ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>
      ) : null}

      {composeOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/50 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="compose-title" className="w-full max-w-lg rounded-[26px] bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Новое сообщение</p>
                <h2 id="compose-title" className="font-display mt-2 text-3xl">
                  {role === "student" ? "Создать обращение" : "Написать ученику"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-500"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <label className="mt-6 block">
              <span className="text-xs font-bold text-stone-600">
                {role === "student" ? "Преподаватель" : "Ученик"}
              </span>
              <select
                value={composeContactId}
                onChange={(event) => setComposeContactId(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-gold/60"
              >
                <option value="">Выберите получателя</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>{contact.name}</option>
                ))}
              </select>
            </label>

            {selectedContact?.directions.length ? (
              <p className="mt-2 text-xs text-stone-500">{selectedContact.directions.join(" · ")}</p>
            ) : null}

            <label className="mt-5 block">
              <span className="text-xs font-bold text-stone-600">Сообщение</span>
              <textarea
                value={composeMessage}
                onChange={(event) => setComposeMessage(event.target.value)}
                rows={6}
                maxLength={3000}
                placeholder={role === "student" ? "Опишите ваш вопрос" : "Напишите сообщение ученику"}
                className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 outline-none focus:border-gold/60"
              />
            </label>

            {composeError ? <p className="mt-3 text-sm font-semibold text-rose-700">{composeError}</p> : null}

            <button
              type="button"
              onClick={() => void startNewConversation()}
              disabled={!composeContactId || !composeMessage.trim() || sending}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={17} />}
              Отправить
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
