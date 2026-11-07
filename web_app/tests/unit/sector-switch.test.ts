import assert from "node:assert/strict";
import test from "node:test";
import { sectorTopicLabel } from "../../src/lib/sector-label";
import { orderOpenSectors, resolveSelectedSector, sectorSwitchLabel } from "../../src/lib/sector-switch";

const waiting = { id: "a", sequence: 1, status: "awaiting_exam" };
const current = { id: "b", sequence: 2, status: "active" };

test("the current sector comes first and is the default", () => {
  assert.deepEqual(orderOpenSectors([waiting, current]).map((sector) => sector.id), ["b", "a"]);
  assert.equal(resolveSelectedSector([waiting, current])?.id, "b");
  assert.equal(resolveSelectedSector([waiting, current], null)?.id, "b");
});

test("the requested sector wins when it is open; an unknown id falls back", () => {
  assert.equal(resolveSelectedSector([waiting, current], "a")?.id, "a");
  assert.equal(resolveSelectedSector([waiting, current], "gone")?.id, "b");
});

test("with no current sector the one waiting for its exam is shown", () => {
  assert.equal(resolveSelectedSector([waiting])?.id, "a");
  assert.equal(resolveSelectedSector([]), null);
});

test("labels name the sector and its state; the student reads «Мой сектор»", () => {
  assert.equal(sectorSwitchLabel(current), "Сектор 2 · текущий");
  assert.equal(sectorSwitchLabel(waiting), "Сектор 1 · ждёт экзамена");
  assert.equal(sectorSwitchLabel(waiting, "student"), "Мой сектор 1 · ждёт экзамена");
});

test("a topic is named with its sector, and the waiting sector says so", () => {
  assert.equal(sectorTopicLabel({ scope: "student", sequence: 2, status: "active" }, "Переборы"), "Сектор 2 · Переборы");
  assert.equal(sectorTopicLabel({ scope: "student", sequence: 1, status: "awaiting_exam" }, "Am и E"), "Сектор 1 · ждёт экзамена · Am и E");
  assert.equal(sectorTopicLabel({ scope: "group", sequence: 3 }, "Ритм"), "План группы 3 · Ритм");
});
