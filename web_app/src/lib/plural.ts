/**
 * В-26: the one Russian plural rule for numbers on the student's screens — «1 урок», «2 урока»,
 * «5 уроков», «11 уроков», «21 урок».
 *
 * `forms` are the word after 1, after 2–4 and after 5–20: `["урок", "урока", "уроков"]`.
 * After «из N» the word is genitive, so pass the genitive forms: `["урока", "уроков", "уроков"]`
 * gives «0 из 1 урока», «0 из 3 уроков».
 */
export type PluralForms = readonly [one: string, few: string, many: string];

export function pluralize(count: number, forms: PluralForms): string {
  const whole = Math.abs(Math.trunc(count));
  const mod100 = whole % 100;
  const mod10 = whole % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** «5 уроков», «12 000 баллов». */
export function formatCount(count: number, forms: PluralForms): string {
  return `${count.toLocaleString("ru-RU")} ${pluralize(count, forms)}`;
}

/** «0 из 1 урока», «3 из 12 тем» — `genitive` are the forms after «из». */
export function formatOutOf(done: number, total: number, genitive: PluralForms): string {
  return `${done.toLocaleString("ru-RU")} из ${formatCount(total, genitive)}`;
}
