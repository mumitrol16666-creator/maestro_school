import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateLeagueRankDelta,
  courseHomeworkLeagueXp,
  getAqtobeWeekRange,
  lessonAttendanceXpForWeek,
  nextWeeklyStreak,
  privateLeagueName,
  onlineAssignmentLeagueXp,
  preparedTestLeagueXp,
  rankLeagueEvents,
  weeklyLeagueFinalizesAt,
  weeklyLeaguePhase,
  WEEKLY_LEAGUE_GOAL_XP,
  WEEKLY_LEAGUE_GOAL_COINS,
  WEEKLY_LEAGUE_PRIZES,
  WEEKLY_LESSON_ATTENDANCE_COINS,
  weeklyStreakMilestone,
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
    assert.equal(WEEKLY_LEAGUE_GOAL_COINS, 25);
    assert.equal(WEEKLY_LESSON_ATTENDANCE_COINS, 50);
    assert.deepEqual(WEEKLY_LEAGUE_PRIZES.map((item) => item.coins), [150, 100, 50]);
  });

  it("reduces XP only after a homework revision or a repeated test attempt", () => {
    assert.equal(courseHomeworkLeagueXp(1), 15);
    assert.equal(courseHomeworkLeagueXp(2), 10);
    assert.equal(onlineAssignmentLeagueXp(1), 15);
    assert.equal(onlineAssignmentLeagueXp(2), 10);
    assert.equal(onlineAssignmentLeagueXp(4), 10);
    assert.equal(preparedTestLeagueXp(1), 20);
    assert.equal(preparedTestLeagueXp(3), 10);
  });

  it("keeps an ended week in finalizing state until an immutable snapshot exists", () => {
    const range = getAqtobeWeekRange(new Date("2026-08-23T12:00:00.000Z"));
    assert.equal(weeklyLeagueFinalizesAt(range).toISOString(), "2026-08-24T07:00:00.000Z");
    assert.equal(weeklyLeaguePhase({
      range,
      now: new Date("2026-08-24T06:59:59.000Z"),
      hasSnapshot: false,
    }), "finalizing");
    assert.equal(weeklyLeaguePhase({
      range,
      now: new Date("2026-08-24T08:00:00.000Z"),
      hasSnapshot: false,
    }), "finalizing");
    assert.equal(weeklyLeaguePhase({
      range,
      now: new Date("2026-08-24T08:00:00.000Z"),
      hasSnapshot: true,
    }), "finalized");
  });

  it("awards attendance XP only for the first two confirmed lessons of a week", () => {
    assert.equal(lessonAttendanceXpForWeek(0), 20);
    assert.equal(lessonAttendanceXpForWeek(1), 20);
    assert.equal(lessonAttendanceXpForWeek(2), 0);
    assert.equal(lessonAttendanceXpForWeek(8), 0);
  });

  it("extends, freezes, and breaks a weekly streak without changing the best result", () => {
    assert.deepEqual(nextWeeklyStreak({
      currentWeeks: 3,
      bestWeeks: 5,
      hasActivity: true,
      frozen: false,
    }), { eventType: "extended", currentWeeks: 4, bestWeeks: 5 });
    assert.deepEqual(nextWeeklyStreak({
      currentWeeks: 4,
      bestWeeks: 5,
      hasActivity: false,
      frozen: true,
    }), { eventType: "frozen", currentWeeks: 4, bestWeeks: 5 });
    assert.deepEqual(nextWeeklyStreak({
      currentWeeks: 4,
      bestWeeks: 5,
      hasActivity: false,
      frozen: false,
    }), { eventType: "broken", currentWeeks: 0, bestWeeks: 5 });
    assert.deepEqual(weeklyStreakMilestone(4), {
      weeks: 4,
      coins: 50,
      title: "Серия 4 недели",
    });
    assert.equal(weeklyStreakMilestone(5), null);
  });
});
