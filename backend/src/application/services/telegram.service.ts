/**
 * Messages to the school's Telegram chat. Modelled on the CRM helper (utils/telegram.js): the
 * bot token and the chat id come only from the server environment. Without them, or when
 * Telegram does not answer, nothing is thrown — the caller's business operation never depends on it.
 */

const SEND_TIMEOUT_MS = 5000;

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isTelegramConfigured(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(source.TELEGRAM_BOT_TOKEN?.trim() && source.TELEGRAM_CHAT_ID?.trim());
}

/** Sends an HTML message. Resolves true only when Telegram accepted it; never rejects. */
export async function sendTelegramMessage(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set, message skipped");
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as { ok?: boolean } | null;
    if (response.ok && data?.ok) return true;
    // The token sits in the URL: log the status only, never the request.
    console.error(`[telegram] sendMessage refused: HTTP ${response.status}`);
    return false;
  } catch (error) {
    console.error("[telegram] sendMessage failed:", error instanceof Error ? error.name : "error");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
