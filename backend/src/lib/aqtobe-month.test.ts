import assert from "node:assert/strict";
import test from "node:test";
import { aqtobeMonthKey } from "./aqtobe-month.js";

test("месяц учебного плана определяется по часовому поясу Актобе", () => {
  assert.equal(aqtobeMonthKey(new Date("2026-07-31T18:30:00.000Z")), "2026-07");
  assert.equal(aqtobeMonthKey(new Date("2026-07-31T20:30:00.000Z")), "2026-08");
});
