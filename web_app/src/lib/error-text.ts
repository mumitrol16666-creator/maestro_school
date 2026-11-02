/** The text for a failed request shown to the student: the Russian reason of the error, else the fallback. */
export function errorToastText(reason: unknown, fallback: string) {
  if (reason instanceof Error && /[а-яё]/i.test(reason.message)) return reason.message;
  return fallback;
}
