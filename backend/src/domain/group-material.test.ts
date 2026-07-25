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
});
