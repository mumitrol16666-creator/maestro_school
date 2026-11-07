import assert from "node:assert/strict";
import test from "node:test";
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
