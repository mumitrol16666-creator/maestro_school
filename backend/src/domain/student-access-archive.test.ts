import assert from "node:assert/strict";
import test from "node:test";
import { ConflictError } from "./errors.js";
import {
  assertStudentAccessCanBeArchived,
  buildArchivedLogin,
  isStudentAccessFullyArchived,
} from "./student-access-archive.js";

test("архивный логин освобождает исходный логин и укладывается в схему", () => {
  const userId = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(buildArchivedLogin(userId), `archived_${userId}`);
  assert.ok(buildArchivedLogin(userId).length <= 64);
});

test("доступ можно архивировать при совпадающей CRM-карточке", () => {
  assert.doesNotThrow(() => {
    assertStudentAccessCanBeArchived({
      actualCrmStudentId: "crm-1",
      requestedCrmStudentId: "crm-1",
      force: false,
    });
  });
});

test("несовпадающая CRM-карточка требует явного force", () => {
  assert.throws(
    () => {
      assertStudentAccessCanBeArchived({
        actualCrmStudentId: "crm-old",
        requestedCrmStudentId: "crm-new",
        force: false,
      });
    },
    (error) =>
      error instanceof ConflictError &&
      error.code === "ACCOUNT_LINK_MISMATCH" &&
      error.statusCode === 409,
  );

  assert.doesNotThrow(() => {
    assertStudentAccessCanBeArchived({
      actualCrmStudentId: "crm-old",
      requestedCrmStudentId: "crm-new",
      force: true,
    });
  });
});

test("старый выключенный аккаунт не считается очищенным, пока реквизиты заняты", () => {
  const userId = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(isStudentAccessFullyArchived({
    userId,
    login: "s_77001234567",
    isActive: false,
    deletedAt: new Date(),
    phoneNormalized: "77001234567",
    crmStudentId: "crm-old",
  }), false);

  assert.equal(isStudentAccessFullyArchived({
    userId,
    login: buildArchivedLogin(userId),
    isActive: false,
    deletedAt: new Date(),
    phoneNormalized: null,
    crmStudentId: null,
  }), true);
});
