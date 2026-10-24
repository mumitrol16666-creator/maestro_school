import assert from "node:assert/strict";
import test from "node:test";
import { topicTitleKey } from "./sector-topic-title.js";

test("topic title key ignores case and repeated spaces", () => {
  assert.equal(topicTitleKey("  Мелодия   «Кузнечик» "), topicTitleKey("мелодия «кузнечик»"));
  assert.notEqual(topicTitleKey("Am и E"), topicTitleKey("Am и Em"));
});
