import assert from "node:assert/strict";
import test from "node:test";
import { crmDirectionTitlesMatch, normalizeCrmDirectionTitle } from "./crm-direction-title.js";

test("normalizes CRM direction titles without changing their meaning", () => {
  assert.equal(normalizeCrmDirectionTitle("  АНСАМБЛЬ\u00a0 "), "ансамбль");
  assert.equal(crmDirectionTitlesMatch("Ансамбль", " ансамбль\u202f"), true);
  assert.equal(crmDirectionTitlesMatch("Ансамбль", "Гитара"), false);
});
