import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isContentAdminRole, isOfflineCoordinatorRole } from "./cms-access.js";

describe("CMS role access", () => {
  it("allows admin and owner", () => {
    assert.equal(isContentAdminRole("admin"), true);
    assert.equal(isContentAdminRole("owner"), true);
  });

  it("rejects student and unrelated roles", () => {
    assert.equal(isContentAdminRole("student"), false);
    assert.equal(isContentAdminRole("teacher"), false);
    assert.equal(isContentAdminRole("super_admin"), false);
  });
});

describe("offline school coordinator access", () => {
  it("allows administrators, owner, curator and branch manager", () => {
    for (const role of ["admin", "owner", "curator", "branch_manager"]) {
      assert.equal(isOfflineCoordinatorRole(role), true);
    }
  });

  it("keeps teachers and students outside coordinator actions", () => {
    assert.equal(isOfflineCoordinatorRole("teacher"), false);
    assert.equal(isOfflineCoordinatorRole("student"), false);
  });
});
