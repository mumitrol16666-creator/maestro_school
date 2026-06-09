import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isContentAdminRole } from "./cms-access.js";

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
