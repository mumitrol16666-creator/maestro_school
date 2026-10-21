/**
 * Plan 1.14: what the lesson itself suggests for the summary and the homework, from the topics the
 * teacher moved and the homework they checked. Pure functions, so the page and its tests agree.
 */
export type LessonTopicChange = { title: string; fromPercent: number | null; toPercent: number };

/** «Тема урока» from the topics whose percent changed, in the order the teacher touched them. */
export function lessonTopicFromChanges(changes: LessonTopicChange[]) {
  const titles = changes.map((change) => change.title.trim()).filter(Boolean);
  return [...new Set(titles)].join("; ");
}

export function summarySuggestions(input: {
  topicChanges: LessonTopicChange[];
  homeworkPercents: number[];
}) {
  const hints: string[] = [];
  for (const change of input.topicChanges) {
    if (change.toPercent === 100 && change.fromPercent !== 100) {
      hints.push(`Закрыли тему «${change.title}»`);
    } else {
      const from = change.fromPercent ?? 0;
      hints.push(from === change.toPercent
        ? `Отработали «${change.title}»`
        : `Отработали «${change.title}»: ${from} → ${change.toPercent} %`);
    }
  }
  if (input.homeworkPercents.length) {
    const average = Math.round(input.homeworkPercents.reduce((sum, value) => sum + value, 0) / input.homeworkPercents.length);
    hints.push(`Проверили домашнее задание: ${average} %`);
  }
  return [...new Set(hints)];
}

export function homeworkSuggestions(input: {
  topic: { title: string; masteryCriteria?: string | null } | null;
  previousHomework: Array<{ instructions: string; completionPercent: number | null }>;
}) {
  const hints: string[] = [];
  const criteria = input.topic?.masteryCriteria?.trim();
  if (input.topic && criteria) hints.push(`«${input.topic.title}»: ${criteria}`);
  for (const previous of input.previousHomework) {
    const text = previous.instructions.trim();
    if (text && previous.completionPercent != null && previous.completionPercent < 100) {
      hints.push(`Доделать прошлое задание: ${text}`);
    }
  }
  return [...new Set(hints)];
}

/** Adds a phrase to a text field: a new sentence, never a duplicate of what is already there. */
export function appendPhrase(current: string, phrase: string) {
  const text = current.trim();
  if (!text) return phrase;
  if (text.includes(phrase)) return current;
  return /[.!?…]$/.test(text) ? `${text} ${phrase}` : `${text}. ${phrase}`;
}

/** When no school phrases are set up yet: neutral ones that fit every direction. */
export const fallbackSchoolPhrases = {
  summary: [
    "Разобрали новый материал",
    "Отработали технику",
    "Исполнили целиком под метроном",
    "Закрепили пройденное",
    "Разобрали ошибки и как их исправить",
  ],
  homework: [
    "Заниматься 15 минут каждый день",
    "Работать под метроном, начиная с медленного темпа",
    "Записать видео и прислать в чат",
    "Повторить пройденное на уроке",
  ],
} as const;
