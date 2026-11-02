/**
 * The homework text the student sees, split into what it is made of. The teacher builds the text
 * from phrases (school phrases, the topic goal, unfinished homework) and it used to arrive as one
 * paragraph, with «Доделать прошлое задание» nested inside itself. Pure, so tests and UI agree.
 */

/** Prefixes for carried-over homework, old and new; a phrase may carry several of them. */
const CARRY_PREFIX = /^(?:\s*(?:доделать прошлое задание|с прошлого урока)\s*:\s*)+/i;
/** «Цель по теме «X»: …» (new) and «X»: … (the topic goal as the hint used to insert it). */
const GOAL = /^(?:цель по теме\s*)?«([^»]+)»\s*:\s*(.+)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"«»]+/gi;
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[«"(A-ZА-ЯЁ0-9])/u;

export type HomeworkItems = {
  goals: Array<{ topic: string; text: string }>;
  tasks: string[];
  carryOver: string[];
  links: string[];
};

function tidy(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim().replace(/[\s.;,:]+$/u, "");
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
}

/** Removes every «Доделать прошлое задание:» / «С прошлого урока:» at the start of a phrase. */
export function stripCarryPrefix(text: string) {
  return text.replace(CARRY_PREFIX, "").trim();
}

export function parseHomeworkInstructions(instructions: string | null | undefined): HomeworkItems {
  const items: HomeworkItems = { goals: [], tasks: [], carryOver: [], links: [] };
  const seen = new Set<string>();
  const push = (list: string[], value: string) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    list.push(value);
  };
  const text = instructions ?? "";
  for (const url of text.match(URL_PATTERN) ?? []) {
    const clean = url.replace(/[).,;]+$/, "");
    if (!items.links.includes(clean)) items.links.push(clean);
  }
  const lines = text.replace(URL_PATTERN, " ").split(/\r?\n/);
  for (const line of lines) {
    // A line that starts with the prefix is old homework as a whole (new texts: one phrase per line).
    // Inside an old one-paragraph text only the sentence with the prefix is old homework.
    const carryLine = CARRY_PREFIX.test(line);
    for (const sentence of line.split(SENTENCE_BREAK)) {
      const isCarry = carryLine || CARRY_PREFIX.test(sentence);
      const body = stripCarryPrefix(sentence);
      const goal = body.match(GOAL);
      if (goal) {
        const topic = goal[1].trim();
        const goalText = tidy(goal[2]);
        const key = `goal:${topic}:${goalText}`.toLowerCase();
        if (goalText && !seen.has(key)) {
          seen.add(key);
          items.goals.push({ topic, text: goalText });
        }
        continue;
      }
      push(isCarry ? items.carryOver : items.tasks, tidy(body));
    }
  }
  return items;
}
