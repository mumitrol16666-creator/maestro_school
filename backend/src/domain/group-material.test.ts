import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedMaterialUrl } from "./group-material.js";

test("материалы группы принимают только пустую, http или https ссылку", () => {
  assert.equal(isSupportedMaterialUrl(""), true);
  assert.equal(isSupportedMaterialUrl("https://example.com/notes.pdf"), true);
  assert.equal(isSupportedMaterialUrl("http://example.com/audio"), true);
  assert.equal(isSupportedMaterialUrl("javascript:alert(1)"), false);
  assert.equal(isSupportedMaterialUrl("data:text/html,test"), false);
  assert.equal(isSupportedMaterialUrl("example.com/file"), false);
  // Uploaded files are kept as same-site paths since plan 1.12.
  assert.equal(isSupportedMaterialUrl("/api/v1/media/pdf/3f2a.pdf"), true);
  assert.equal(isSupportedMaterialUrl("/api/v1/media/files/x.mp4?download=1"), true);
  assert.equal(isSupportedMaterialUrl("/api/v1/media/other/x.mp4"), false);
  assert.equal(isSupportedMaterialUrl("/etc/passwd"), false);
});
