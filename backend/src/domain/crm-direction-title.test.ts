import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedCrmDirectionId,
  crmDirectionTitlesMatch,
  isAssignedCrmDirectionId,
  mergeAssignedCrmDirections,
  normalizeCrmDirectionTitle,
} from "./crm-direction-title.js";

test("normalizes CRM direction titles without changing their meaning", () => {
  assert.equal(normalizeCrmDirectionTitle("  АНСАМБЛЬ\u00a0 "), "ансамбль");
  assert.equal(crmDirectionTitlesMatch("Ансамбль", " ансамбль\u202f"), true);
  assert.equal(crmDirectionTitlesMatch("Ансамбль", "Гитара"), false);
});

test("creates a stable local reference for a CRM-assigned direction missing from the catalog", () => {
  const first = assignedCrmDirectionId("Ансамбль");
  const second = assignedCrmDirectionId("  АНСАМБЛЬ\u00a0");
  assert.equal(first, second);
  assert.equal(isAssignedCrmDirectionId(first), true);
});

test("teacher directions include assigned group titles absent from the CRM catalog", () => {
  const directions = mergeAssignedCrmDirections([
    {
      crmDirectionId: "crm-guitar",
      title: "Гитара",
      isActive: true,
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
  ], ["Гитара", "Ансамбль", " ансамбль\u202f"]);

  assert.equal(directions.length, 2);
  assert.equal(directions[0]?.crmDirectionId, "crm-guitar");
  assert.equal(directions[1]?.title, "Ансамбль");
  assert.equal(isAssignedCrmDirectionId(directions[1]?.crmDirectionId), true);
});
