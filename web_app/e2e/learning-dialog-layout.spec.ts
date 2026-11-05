import { expect, test } from "@playwright/test";

// A teacher's real roster can be much longer than the visible mailbox.
// Keep this independent of a seeded database so that the overflow is always exercised.
for (const empty of [true, false]) {
  test(`long teacher roster keeps ${empty ? "empty" : "populated"} thread and composer inside mailbox`, async ({ page, context }) => {
    const teacher = { id: "layout-teacher", firstName: "Преподаватель", role: "teacher", permissions: [], productFeatures: { learningDialogsV2: true } };
    const members = [
      { userId: teacher.id, name: teacher.firstName, role: "teacher", avatar: null, canWrite: true, joinedAt: "2026-01-01T00:00:00Z", leftAt: null, restrictedUntil: null, restrictionReason: null },
      { userId: "layout-student", name: "Ученица Примерова", role: "student", avatar: null, canWrite: true, joinedAt: "2026-01-01T00:00:00Z", leftAt: null, restrictedUntil: null, restrictionReason: null },
    ];
    const conversations = Array.from({ length: 60 }, (_, index) => ({
      id: `layout-dialog-${index}`, type: "learning_direction", status: "active", title: null,
      crmDirectionId: "layout-guitar", crmGroupId: null, members, lastMessage: null, lastMessageAt: null,
      unreadCount: 0, canWrite: true, notificationsMuted: false, archivedAt: null, openReportCount: 0,
    }));
    const messages = empty ? [] : Array.from({ length: 30 }, (_, index) => ({
      id: `layout-message-${index}`, authorId: "layout-student", authorName: "Ученица Примерова", mine: false,
      body: `Сообщение ${index + 1}: проверяем историю переписки`, state: "visible", currentVersionId: null,
      contextType: null, contextId: null, editedAt: null, retractedAt: null, createdAt: "2026-01-01T00:00:00Z", attachments: [],
    }));
    await context.addInitScript(user => {
      localStorage.setItem("maestro_access_token", "layout-fixture");
      localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    }, teacher);
    await page.route("**/api/v1/**", route => {
      const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
      const data = path === "/auth/me" ? teacher
        : path === "/learning-dialogs" ? conversations
        : path === "/learning-dialogs/layout-dialog-0" ? { ...conversations[0], messages, nextCursor: null }
        : path.endsWith("unread-count") ? { count: 0 } : [];
      return route.fulfill({ json: { data } });
    });
    await page.goto("/admin/messages?conversation=layout-dialog-0");
    const mailbox = page.getByTestId("learning-dialog-mailbox");
    const composer = mailbox.getByTestId("learning-dialog-composer");
    await expect(mailbox.getByPlaceholder("Сообщение")).toBeVisible();
    const bounds = await mailbox.boundingBox();
    const composerBounds = await composer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(composerBounds).not.toBeNull();
    expect(composerBounds!.y + composerBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
    const list = mailbox.getByTestId("learning-dialog-list");
    const history = mailbox.getByTestId("learning-dialog-messages");
    if (test.info().project.name === "chromium") {
      expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(list.getByTestId("learning-dialog-row").last()).toBeInViewport();
    }
    if (empty) {
      await expect(history.getByText("Начните переписку")).toBeInViewport();
    } else {
      await expect(history.locator("article").last()).toBeInViewport();
      expect(await history.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    }
  });
}
