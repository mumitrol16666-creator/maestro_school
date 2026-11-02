import { expect, test } from "@playwright/test";
import { formatCount, formatOutOf, pluralize } from "../src/lib/plural";

// В-26: the one Russian plural rule of the student's screens. No browser: a unit test of the helpers.
const LESSONS = ["урок", "урока", "уроков"] as const;
const LESSONS_GENITIVE = ["урока", "уроков", "уроков"] as const;
const TOPICS_GENITIVE = ["темы", "тем", "тем"] as const;

test("pluralize picks the form after 1, 2–4 and 5–20, including the teens and the hundreds", () => {
  const expected: Array<[number, string]> = [
    [0, "уроков"],
    [1, "урок"],
    [2, "урока"],
    [4, "урока"],
    [5, "уроков"],
    [11, "уроков"],
    [12, "уроков"],
    [14, "уроков"],
    [21, "урок"],
    [22, "урока"],
    [25, "уроков"],
    [101, "урок"],
    [111, "уроков"],
    [112, "уроков"],
    [121, "урок"],
  ];
  for (const [count, word] of expected) {
    expect(pluralize(count, LESSONS), `${count}`).toBe(word);
  }
});

test("formatCount puts the number before the word", () => {
  expect(formatCount(0, LESSONS)).toBe("0 уроков");
  expect(formatCount(1, LESSONS)).toBe("1 урок");
  expect(formatCount(2, LESSONS)).toBe("2 урока");
  expect(formatCount(5, LESSONS)).toBe("5 уроков");
  expect(formatCount(11, LESSONS)).toBe("11 уроков");
  expect(formatCount(21, LESSONS)).toBe("21 урок");
  expect(formatCount(111, LESSONS)).toBe("111 уроков");
});

test("formatOutOf puts the word after «из» into the genitive", () => {
  expect(formatOutOf(0, 1, LESSONS_GENITIVE)).toBe("0 из 1 урока");
  expect(formatOutOf(3, 12, TOPICS_GENITIVE)).toBe("3 из 12 тем");
  expect(formatOutOf(1, 21, LESSONS_GENITIVE)).toBe("1 из 21 урока");
  expect(formatOutOf(2, 5, LESSONS_GENITIVE)).toBe("2 из 5 уроков");
});
