import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listPreparedTestTemplates } from "./prepared-tests.js";
import { listPreparedTestTheoryMaterials } from "./prepared-test-theory.js";

describe("prepared test theory materials", () => {
  it("covers every prepared theory test with study content and a verified book reference", () => {
    const materials = listPreparedTestTheoryMaterials();
    assert.deepEqual(materials.map(material=>material.testId),listPreparedTestTemplates().map(test=>test.id));
    assert.equal(new Set(materials.map(material=>material.testId)).size,materials.length);
    for (const material of materials) {
      assert.ok(material.title.length > 10);
      assert.ok(material.sections.length >= 3);
      assert.ok(material.remember.length >= 3);
      assert.ok(material.practice.length >= 2);
      assert.ok(material.readingMinutes > 0);
      assert.ok(material.source?.section);
      assert.ok(material.source?.pdfPages.length);
      assert.ok(material.source?.printedPages.every(page=>page>0));
    }
  });
});
