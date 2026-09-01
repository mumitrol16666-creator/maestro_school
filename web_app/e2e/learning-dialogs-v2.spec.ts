import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

type Session = { token: string; user: unknown };
type Conversation = {
  id: string;
  type: "learning_direction" | "parent_teacher" | "curator" | "crm_group";
  openReportCount: number;
  lastMessage: { body: string | null } | null;
};

async function loginSession(
  request: APIRequestContext,
  login: string,
  profile: "student" | "parent" | "staff",
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: login, password: PASSWORD, profile },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as Session;
}

async function installSession(context: BrowserContext, session: Session) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

async function conversationByType(
  request: APIRequestContext,
  token: string,
  type: Conversation["type"],
  options: { nonEmpty?: boolean; withOpenReport?: boolean } = {},
) {
  const response = await request.get("/api/v1/learning-dialogs?archive=active", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  const conversations = (await response.json()).data as Conversation[];
  const conversation = conversations.find((item) => (
    item.type === type
      && (!options.nonEmpty || item.lastMessage !== null)
      && (!options.withOpenReport || item.openReportCount > 0)
  ));
  expect(conversation, `Expected ${type} conversation`).toBeTruthy();
  return conversation!;
}

async function ensureLongConversation(
  request: APIRequestContext,
  token: string,
  conversationId: string,
) {
  const detailResponse = await request.get(`/api/v1/learning-dialogs/${conversationId}?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(detailResponse.ok()).toBe(true);
  const messageCount = ((await detailResponse.json()).data.messages as unknown[]).length;
  for (let index = messageCount; index < 14; index += 1) {
    const response = await request.post(`/api/v1/learning-dialogs/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        message: `QA длинная переписка ${index + 1}: сообщение проверяет прокрутку истории и закреплённое поле ввода.`,
        idempotencyKey: `qa-long-dialog-${conversationId}-${index}`,
      },
    });
    expect(response.ok()).toBe(true);
  }
}

async function dismissEntryDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (!await dialog.isVisible()) return;
  const close = dialog.getByRole("button", { name: "Закрыть" });
  if (await close.isVisible()) await close.click();
}

test("student opens a learning dialog and sends a message", async ({ page, request, context }, testInfo) => {
  const session = await loginSession(request, "qa_student_1", "student");
  const conversation = await conversationByType(request, session.token, "learning_direction", { nonEmpty: true });
  await installSession(context, session);
  await page.goto(`/messages?conversation=${conversation.id}`);
  await dismissEntryDialog(page);

  const mailbox = page.getByTestId("learning-dialog-mailbox");
  await expect(mailbox).toBeVisible();
  const messages = mailbox.getByTestId("learning-dialog-messages");
  if (conversation.lastMessage?.body) {
    await expect(messages.getByText(conversation.lastMessage.body, { exact: true })).toBeVisible();
  }
  const composer = mailbox.getByPlaceholder("Сообщение");
  await expect(composer).toBeVisible();
  const message = `QA UI: сообщение ученика доставлено · ${testInfo.project.name} · ${Date.now()}`;
  await composer.fill(message);
  await mailbox.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(composer).toHaveValue("");
  await expect(messages.getByText(message, { exact: true })).toBeVisible();
});

test("teacher keeps one continuous parent conversation", async ({ page, request, context }) => {
  const session = await loginSession(request, "qa_teacher_1", "staff");
  const conversation = await conversationByType(request, session.token, "parent_teacher", { nonEmpty: true });
  await installSession(context, session);
  await page.goto(`/admin/messages?conversation=${conversation.id}`);
  await dismissEntryDialog(page);

  const mailbox = page.getByTestId("learning-dialog-mailbox");
  await expect(mailbox.getByText("Подскажите, пожалуйста, что Камбару повторить", { exact: false })).toBeVisible();
  await expect(mailbox.getByPlaceholder("Сообщение")).toBeVisible();
});

test("parent sees the family dialog but not the child's teacher chat", async ({ page, request, context }) => {
  const session = await loginSession(request, "qa_parent_1", "parent");
  const conversation = await conversationByType(request, session.token, "parent_teacher", { nonEmpty: true });
  await installSession(context, session);
  await page.goto(`/family/messages?conversation=${conversation.id}`);
  await dismissEntryDialog(page);

  const mailbox = page.getByTestId("learning-dialog-mailbox");
  await expect(mailbox.getByTestId("learning-dialog-active-header")).toContainText("Родители и преподаватель");
  await expect(mailbox.getByText("Не получается чисто сыграть переход", { exact: false })).toHaveCount(0);
  await expect(mailbox.getByPlaceholder("Сообщение")).toBeVisible();
});

test("admin sees the student, complaint controls and read-only learning dialog", async ({ page, request, context }) => {
  const session = await loginSession(request, "qa_admin", "staff");
  const conversation = await conversationByType(request, session.token, "learning_direction", { withOpenReport: true });
  await installSession(context, session);
  await page.goto(`/admin/communications?conversation=${conversation.id}`);
  await dismissEntryDialog(page);

  const mailbox = page.getByTestId("learning-dialog-mailbox");
  await expect(mailbox.getByTestId("learning-dialog-active-header")).toContainText(/Камбар Казыбаев/);
  await expect(mailbox.getByText("QA-жалоба для проверки модерации", { exact: false })).toBeVisible();
  await expect(mailbox.getByRole("button", { name: "Решить" })).toBeVisible();
  await expect(mailbox.getByText("Диалог доступен только для чтения")).toBeVisible();
});

test("mobile dialog stays inside a 390px viewport", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await loginSession(request, "qa_student_1", "student");
  const conversation = await conversationByType(request, session.token, "crm_group");
  await ensureLongConversation(request, session.token, conversation.id);
  await installSession(context, session);
  await page.goto(`/messages?conversation=${conversation.id}`);
  await dismissEntryDialog(page);

  const mailbox = page.getByTestId("learning-dialog-mailbox");
  await expect(mailbox.getByRole("button", { name: "К списку диалогов" })).toBeVisible();
  await expect(mailbox.getByPlaceholder("Сообщение")).toBeVisible();
  await expect(mailbox.getByRole("button", { name: "Прикрепить фото, видео или файл" })).toBeVisible();
  await expect(mailbox.getByTestId("learning-dialog-file-input")).toHaveAttribute("accept", /video\/mp4/);
  const mailboxBox = await mailbox.boundingBox();
  const composerBox = await mailbox.getByTestId("learning-dialog-composer").boundingBox();
  const visualViewport = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  expect(mailboxBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  await expect(page.getByTestId("student-mobile-navigation")).toBeHidden();
  expect(mailboxBox!.x).toBeCloseTo(0, 0);
  expect(mailboxBox!.y).toBeCloseTo(0, 0);
  expect(mailboxBox!.width).toBeCloseTo(visualViewport.width, 0);
  expect(mailboxBox!.height).toBeCloseTo(visualViewport.height, 0);
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(mailboxBox!.y + mailboxBox!.height + 1);
  const messageViewport = mailbox.getByTestId("learning-dialog-messages");
  await expect.poll(() => messageViewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const scrollPosition = await messageViewport.evaluate((element) => ({
    bottomGap: element.scrollHeight - element.clientHeight - element.scrollTop,
  }));
  expect(scrollPosition.bottomGap).toBeLessThanOrEqual(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await mailbox.getByPlaceholder("Сообщение").focus();
  await page.setViewportSize({ width: 390, height: 480 });
  await expect.poll(() => mailbox.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(480);
  const keyboardComposerBox = await mailbox.getByTestId("learning-dialog-composer").boundingBox();
  expect(keyboardComposerBox).not.toBeNull();
  expect(keyboardComposerBox!.y + keyboardComposerBox!.height).toBeLessThanOrEqual(481);
  expect(await messageViewport.evaluate((element) => element.clientHeight)).toBeGreaterThan(0);
  await expect.poll(() => messageViewport.evaluate((element) => (
    element.scrollHeight - element.clientHeight - element.scrollTop
  ))).toBeLessThanOrEqual(2);
  const latestMessageBox = await messageViewport.locator("article").last().boundingBox();
  const keyboardMessageViewportBox = await messageViewport.boundingBox();
  expect(latestMessageBox).not.toBeNull();
  expect(keyboardMessageViewportBox).not.toBeNull();
  expect(latestMessageBox!.y + latestMessageBox!.height).toBeLessThanOrEqual(
    keyboardMessageViewportBox!.y + keyboardMessageViewportBox!.height + 1,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await mailbox.getByPlaceholder("Сообщение").evaluate((element) => (element as HTMLElement).blur());
  await mailbox.getByRole("button", { name: "К списку диалогов" }).click();
  await expect(page.getByTestId("student-mobile-navigation")).toBeVisible();
  await expect(mailbox).not.toHaveAttribute("data-mobile-thread-active", "true");
  expect(await page.evaluate(() => document.body.classList.contains("maestro-dialog-active"))).toBe(false);
});

test("mobile conversation list reaches its final row above navigation", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await loginSession(request, "qa_student_1", "student");
  await installSession(context, session);
  await page.goto("/messages");
  await dismissEntryDialog(page);

  const mailbox = page.getByTestId("learning-dialog-mailbox");
  const list = mailbox.getByTestId("learning-dialog-list");
  const rows = list.getByTestId("learning-dialog-row");
  const navigation = page.getByTestId("student-mobile-navigation");
  await expect(mailbox).toBeVisible();
  await expect(navigation).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(3);

  const lastRow = rows.last();
  await lastRow.scrollIntoViewIfNeeded();
  await expect(lastRow).toBeVisible();
  const mailboxBox = await mailbox.boundingBox();
  const listBox = await list.boundingBox();
  const lastRowBox = await lastRow.boundingBox();
  const navigationBox = await navigation.boundingBox();
  expect(mailboxBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect(lastRowBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(mailboxBox!.y + mailboxBox!.height).toBeLessThanOrEqual(navigationBox!.y + 1);
  expect(lastRowBox!.y + lastRowBox!.height).toBeLessThanOrEqual(listBox!.y + listBox!.height + 1);
});
