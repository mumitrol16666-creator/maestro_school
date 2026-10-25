/**
 * Plan 5.6: the school's fallback lines for «пора взять гитару» and the answers to «позанимался».
 * Friendly with a light poke, never a put-down. Admins replace them in «Шаблоны урока».
 */
export const PRACTICE_REMINDER_PHRASES = [
  "Кто на гитаре не играл, тот кайфа не видал",
  "Ну, сегодня ты в ударе? Проверим",
  "Гитара скучает. Пять минут — и она твоя",
  "Струны сами не зазвучат",
  "Метроном включён, ждёт тебя",
  "Один куплет — и ты герой вечера",
  "Пальцы помнят, если им напоминать",
  "Сыграй то, что получается, потом то, что нет",
  "Пять минут сегодня лучше часа в субботу",
  "Соседи ждут концерт",
  "Чехол — не дом для гитары",
  "Тот самый момент, когда можно взять гитару. Да, прямо сейчас",
  "Два аккорда — уже песня. Проверь",
  "Сегодня без фальши? Сыграй и узнаем",
  "Учитель в четверг спросит. Пусть ответят пальцы",
  "Пока чайник кипит, успеешь куплет",
  "Самое сложное — взять гитару в руки. Остальное проще",
  "Твоя тема ждёт ещё процентов. Добавим?",
  "Играть — это как чистить зубы, только весело",
  "Один подход к метроному. Без фанатизма",
] as const;

export const PRACTICE_CHECKIN_REPLIES = [
  "Так и знал, что в ударе",
  "Гитара довольна. Ты тоже",
  "Ещё один день в копилку",
  "Пальцы сказали спасибо",
  "Вот это по-нашему",
  "Соседи оценили. Наверное",
] as const;

export const LESSON_TOMORROW_PHRASES = [
  "Завтра урок в {time}. Гитару не забудь, настроение — тоже",
  "Завтра в {time} — встреча с преподавателем. Сыграешь что-нибудь новенькое?",
  "Урок завтра в {time}. Сегодня пять минут — завтра герой",
] as const;

/** A line for the day: the same student does not get the same one two days in a row. */
export function pickPhrase<T extends readonly string[]>(phrases: T, dayKey: string, seed: string, previous?: string | null): T[number] {
  if (!phrases.length) return "" as T[number];
  let hash = 0;
  for (const char of `${dayKey}:${seed}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  let index = hash % phrases.length;
  if (phrases.length > 1 && phrases[index] === previous) index = (index + 1) % phrases.length;
  return phrases[index]!;
}
