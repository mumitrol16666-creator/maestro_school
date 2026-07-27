import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterLoginCandidatesByProfile,
  roleMatchesLoginProfile,
} from "./login-profile.js";

describe("login profile selection", () => {
  it("separates student and parent accounts sharing one phone", () => {
    const candidates = [
      { id: "student", role: { slug: "student" } },
      { id: "parent", role: { slug: "parent" } },
    ];

    assert.deepEqual(
      filterLoginCandidatesByProfile(candidates, "student").map((item) => item.id),
      ["student"],
    );
    assert.deepEqual(
      filterLoginCandidatesByProfile(candidates, "parent").map((item) => item.id),
      ["parent"],
    );
  });

  it("keeps staff roles outside family profiles", () => {
    assert.equal(roleMatchesLoginProfile("teacher", "staff"), true);
    assert.equal(roleMatchesLoginProfile("admin", "staff"), true);
    assert.equal(roleMatchesLoginProfile("student", "staff"), false);
    assert.equal(roleMatchesLoginProfile("parent", "staff"), false);
  });
});
