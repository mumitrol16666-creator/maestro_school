import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPhoneLoginCandidates,
  selectProvisionCandidate,
} from "./shared-phone-accounts.js";

test("phone login is rejected as ambiguous when a family shares one number", () => {
  assert.deepEqual(classifyPhoneLoginCandidates([{ id: "child" }, { id: "adult" }]), {
    kind: "ambiguous",
    count: 2,
  });
});

test("provision reuses only one unlinked student with the same full name", () => {
  const child = {
    id: "child",
    firstName: "Алёна",
    lastName: "Иванова",
    crmStudentId: null,
    role: { slug: "student" },
  };
  const adult = {
    id: "adult",
    firstName: "Мария",
    lastName: "Иванова",
    crmStudentId: "crm-adult",
    role: { slug: "student" },
  };

  assert.deepEqual(
    selectProvisionCandidate([adult, child], { firstName: "алена", lastName: "ИВАНОВА" }),
    { kind: "reuse", user: child },
  );
});

test("provision creates a separate account when the shared phone belongs to another person", () => {
  const child = {
    id: "child",
    firstName: "Алёна",
    lastName: "Иванова",
    crmStudentId: "crm-child",
    role: { slug: "student" },
  };

  assert.deepEqual(
    selectProvisionCandidate([child], { firstName: "Мария", lastName: "Иванова" }),
    { kind: "create" },
  );
});
