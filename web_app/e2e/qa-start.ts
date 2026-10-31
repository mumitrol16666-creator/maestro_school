import { expect, type APIRequestContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";
let adminToken: string | null = null;

/**
 * Fixture setup: starts a QA lesson the way the admin «за преподавателя» does. Since 31.10 a
 * teacher cannot start a lesson while an earlier one of theirs owes its report, and the stand
 * keeps the lessons of earlier runs open; the rule itself is covered by lesson-start-rule.spec.ts.
 */
export async function startQaLessonForTeacher(request: APIRequestContext, crmClassId: string) {
  if (!adminToken) {
    const login = await request.post("/api/v1/auth/login", {
      data: { phone: "qa_admin", password: PASSWORD, profile: "staff" },
    });
    expect(login.ok(), await login.text()).toBe(true);
    adminToken = (await login.json()).data.token as string;
  }
  const started = await request.post(
    `/api/v1/admin/offline-lessons/${encodeURIComponent(crmClassId)}/start-for-teacher`,
    { headers: { Authorization: `Bearer ${adminToken}` }, data: {} },
  );
  expect(started.ok(), await started.text()).toBe(true);
}
