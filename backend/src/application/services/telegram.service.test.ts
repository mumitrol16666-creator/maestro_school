import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { escapeTelegramHtml, isTelegramConfigured, sendTelegramMessage } from "./telegram.service.js";
import { buildPaymentTelegramMessage } from "./course-payment.service.js";
import { appPublicUrl } from "../../config/app-url.js";

const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realError = console.error;
const saved = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID };
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  console.warn = (...args: unknown[]) => { logged.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { logged.push(args.join(" ")); };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.error = realError;
  for (const [key, value] of [["TELEGRAM_BOT_TOKEN", saved.token], ["TELEGRAM_CHAT_ID", saved.chat]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("without a token or a chat the message is skipped with one log line and no network call", async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response("{}"); }) as typeof fetch;
  assert.equal(isTelegramConfigured(), false);
  assert.equal(await sendTelegramMessage("текст"), false);
  assert.equal(calls, 0);
  assert.equal(logged.length, 1);
  process.env.TELEGRAM_BOT_TOKEN = "token-only";
  assert.equal(await sendTelegramMessage("текст"), false, "a token without a chat is not enough");
  assert.equal(calls, 0);
});

test("a configured send posts HTML to the bot API and reports success", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:secret";
  process.env.TELEGRAM_CHAT_ID = "-1001";
  const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await sendTelegramMessage("<b>Привет</b>"), true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.telegram.org/bot123:secret/sendMessage");
  assert.deepEqual(seen[0].body, { chat_id: "-1001", text: "<b>Привет</b>", parse_mode: "HTML", disable_web_page_preview: true });
});

test("a network error and a refusal give false and never throw; the token is not logged", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:secret";
  process.env.TELEGRAM_CHAT_ID = "-1001";
  globalThis.fetch = (async () => { throw new TypeError("fetch failed https://api.telegram.org/bot123:secret/sendMessage"); }) as typeof fetch;
  assert.equal(await sendTelegramMessage("x"), false);
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false }), { status: 400 })) as typeof fetch;
  assert.equal(await sendTelegramMessage("x"), false);
  globalThis.fetch = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch;
  assert.equal(await sendTelegramMessage("x"), false);
  assert.ok(logged.length >= 3);
  assert.ok(!logged.join("\n").includes("secret"), "the token never reaches the log");
});

test("HTML in names cannot break the message", () => {
  assert.equal(escapeTelegramHtml('<a href="x">&</a>'), '&lt;a href="x"&gt;&amp;&lt;/a&gt;');
});

test("the new-payment message carries the course, the amount, names and the link — no phone, no note", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    amountKzt: 15000,
    payerNote: "мой номер 87011234567",
    course: { title: "Гитара <с нуля>" },
    student: { id: "s", firstName: "Иван", lastName: "Петров", middleName: "Сергеевич" },
    payer: { id: "p", firstName: "Анна", lastName: "Петрова", middleName: null },
    studentId: "s",
    payerUserId: "s",
  };
  const own = buildPaymentTelegramMessage(base, "https://app.example.kz");
  assert.ok(own.includes("Гитара &lt;с нуля&gt;"));
  assert.ok(own.includes("15 000 ₸"));
  assert.ok(own.includes("Ученик: Иван Петров"));
  assert.ok(!own.includes("Сергеевич"));
  assert.ok(own.includes("Платил: ученик"));
  assert.ok(own.includes('href="https://app.example.kz/admin/course-payments?request=11111111-1111-4111-8111-111111111111"'));
  assert.ok(!own.includes("87011234567"));
  const byParent = buildPaymentTelegramMessage({ ...base, payerUserId: "p" }, null);
  assert.ok(byParent.includes("Платил: родитель Анна Петрова"));
  assert.ok(!byParent.includes("href"), "no public address, no link");
});

test("the public address comes from APP_PUBLIC_URL, else from the first CORS_ORIGIN entry", () => {
  assert.equal(appPublicUrl({ APP_PUBLIC_URL: "https://app.maestro.com.kz/", CORS_ORIGIN: "http://x" }), "https://app.maestro.com.kz");
  assert.equal(appPublicUrl({ CORS_ORIGIN: "https://app.maestro.com.kz, https://other.kz" }), "https://app.maestro.com.kz");
  assert.equal(appPublicUrl({ APP_PUBLIC_URL: "  ", CORS_ORIGIN: "" }), null);
  assert.equal(appPublicUrl({ APP_PUBLIC_URL: "javascript:alert(1)" }), null);
});
