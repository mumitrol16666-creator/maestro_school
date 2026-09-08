import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listPreparedTestTheoryMaterials } from "./prepared-test-theory.js";

describe("prepared test theory materials", () => {
  it("covers every test in the first section with printable study content", () => {
    const materials = listPreparedTestTheoryMaterials();
    assert.deepEqual(materials.map((material) => material.testId), [
      "theory-1-1",
      "theory-1-2",
      "theory-1-3",
      "theory-1-4",
      "theory-1-5",
    ]);
    for (const material of materials) {
      assert.ok(material.title.length > 10);
      assert.ok(material.sections.length >= 3);
      assert.ok(material.remember.length >= 3);
      assert.ok(material.practice.length >= 2);
      assert.ok(material.readingMinutes > 0);
    }
  });
});
