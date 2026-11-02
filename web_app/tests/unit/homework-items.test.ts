import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHomeworkInstructions } from "../../src/lib/homework-items";
import { appendHomeworkLine, homeworkSuggestions } from "../../src/lib/lesson-hints";

// The text a student actually saw on 01.11: phrases glued into one paragraph, old homework nested.
const glued = "Заниматься 15 минут каждый день. Доделать прошлое задание: Повторять аккорды и бои. Работать под метроном, начиная с медленного темпа. «1 Модуль»: 3 упражнения на 100BPM.\nДоделать прошлое задание: Отработать новые аккорды и бой";

test("an old glued paragraph becomes a goal, a task list and the carried-over part", () => {
  const items = parseHomeworkInstructions(glued);
  assert.deepEqual(items.goals, [{ topic: "1 Модуль", text: "3 упражнения на 100BPM" }]);
  assert.deepEqual(items.tasks, [
    "Заниматься 15 минут каждый день",
    "Работать под метроном, начиная с медленного темпа",
  ]);
  assert.deepEqual(items.carryOver, ["Повторять аккорды и бои", "Отработать новые аккорды и бой"]);
});

test("nested prefixes are removed, duplicates shown once, links taken out of the text", () => {
  const items = parseHomeworkInstructions(
    "С прошлого урока: Доделать прошлое задание: Доделать прошлое задание: Бой «восьмёрка»\nСмотреть разбор https://youtu.be/abc123.\nсмотреть разбор",
  );
  assert.deepEqual(items.carryOver, ["Бой «восьмёрка»"]);
  assert.deepEqual(items.tasks, ["Смотреть разбор"]);
  assert.deepEqual(items.links, ["https://youtu.be/abc123"]);
});

test("the new goal phrase and an empty text", () => {
  assert.deepEqual(parseHomeworkInstructions("Цель по теме «Аккорды»: 10 переходов за 20 секунд").goals, [
    { topic: "Аккорды", text: "10 переходов за 20 секунд" },
  ]);
  assert.deepEqual(parseHomeworkInstructions(""), { goals: [], tasks: [], carryOver: [], links: [] });
});

test("the teacher's hint carries over only the old tasks, once, without nesting", () => {
  const hints = homeworkSuggestions({
    topic: { title: "1 Модуль", masteryCriteria: "3 упражнения на 100BPM" },
    previousHomework: [{ instructions: glued, completionPercent: 50 }],
  });
  assert.equal(hints[0], "Цель по теме «1 Модуль»: 3 упражнения на 100BPM");
  assert.equal(
    hints[1],
    "С прошлого урока: Повторять аккорды и бои; Отработать новые аккорды и бой; Заниматься 15 минут каждый день; Работать под метроном, начиная с медленного темпа",
  );
  assert.equal(hints.length, 2);
  assert.ok(!hints[1].includes("Доделать прошлое задание"));
  assert.equal(homeworkSuggestions({ topic: null, previousHomework: [{ instructions: glued, completionPercent: 100 }] }).length, 0);
});

test("homework phrases go on separate lines and never twice", () => {
  let text = appendHomeworkLine("", "Заниматься 15 минут каждый день");
  text = appendHomeworkLine(text, "Работать под метроном");
  text = appendHomeworkLine(text, "Работать под метроном");
  assert.equal(text, "Заниматься 15 минут каждый день\nРаботать под метроном");
});
