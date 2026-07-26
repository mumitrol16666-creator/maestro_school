import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateLeagueRankDelta,
  courseHomeworkLeagueXp,
  getAqtobeWeekRange,
  privateLeagueName,
  onlineAssignmentLeagueXp,
  preparedTestLeagueXp,
  rankLeagueEvents,
  WEEKLY_LEAGUE_GOAL_XP,
  WEEKLY_LEAGUE_PRIZES,
} from "./weekly-league-policy.js";

describe("weekly Maestro league", () => {
  it("starts on Monday at 00:00 in Asia/Aqtobe", () => {
    const range = getAqtobeWeekRange(new Date("2026-07-26T18:00:00.000Z"));
    assert.equal(range.key, "2026-07-20");
    assert.equal(range.start.toISOString(), "2026-07-19T19:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-07-26T19:00:00.000Z");
  });

  it("moves to a new competition exactly at local midnight", () => {
    const range = getAqtobeWeekRange(new Date("2026-07-26T19:00:00.000Z"));
    assert.equal(range.key, "2026-07-27");
    assert.equal(range.start.toISOString(), "2026-07-26T19:00:00.000Z");
  });

  it("sorts equal XP by meaningful actions and then earlier finish", () => {
    const student = (firstName: string) => ({ firstName, lastName: "Тестов" });
    const ranking = rankLeagueEvents([
      { studentId: "a", amount: 20, sourceType: "offline_lesson", createdAt: new Date("2026-07-21T10:00:00Z"), description: "", student: student("Алия") },
      { studentId: "b", amount: 10, sourceType: "online_assignment", createdAt: new Date("2026-07-20T10:00:00Z"), description: "", student: student("Борис") },
      { studentId: "b", amount: 10, sourceType: "monthly_plan", createdAt: new Date("2026-07-22T10:00:00Z"), description: "", student: student("Борис") },
    ]);
    assert.deepEqual(ranking.map((item) => item.studentId), ["b", "a"]);
    assert.equal(ranking[0].xp, 20);
  });

  it("keeps names private and reports movement correctly", () => {
    assert.equal(privateLeagueName("Алия", "Серикова"), "Алия С.");
    assert.equal(calculateLeagueRankDelta(2, 5), 3);
    assert.equal(calculateLeagueRankDelta(5, 2), -3);
    assert.equal(calculateLeagueRankDelta(1), null);
  });

  it("has fixed weekly goal and podium prizes", () => {
    assert.equal(WEEKLY_LEAGUE_GOAL_XP, 80);
    assert.deepEqual(WEEKLY_LEAGUE_PRIZES.map((item) => item.coins), [15, 10, 7]);
  });

  it("reduces XP for revisions, lateness and repeated test attempts", () => {
    assert.equal(courseHomeworkLeagueXp(1), 15);
    assert.equal(courseHomeworkLeagueXp(2), 10);
    assert.equal(onlineAssignmentLeagueXp({ late: false, withRemarks: false }), 15);
    assert.equal(onlineAssignmentLeagueXp({ late: false, withRemarks: true }), 10);
    assert.equal(onlineAssignmentLeagueXp({ late: true, withRemarks: false }), 5);
    assert.equal(preparedTestLeagueXp(1), 20);
    assert.equal(preparedTestLeagueXp(3), 10);
  });
});
