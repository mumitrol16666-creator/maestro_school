export type BackTarget = { href: string; label: string };

/**
 * В-7: where «назад» leads from a screen the student went deeper into. Always the parent screen
 * of the section, never «the previous page»: «Сектор» leads to «Обучение», a test to «Тесты».
 * A section root (a bottom tab) has no «назад». A screen whose parent depends on its data
 * (a course lesson → its course) replaces the target with `usePageBackTarget`.
 */
const learning: BackTarget = { href: "/learning", label: "Обучение" };
const home: BackTarget = { href: "/dashboard", label: "Главная" };

const rules: ReadonlyArray<readonly [RegExp, BackTarget]> = [
  [/^\/tasks\/school\/[^/]+/, { href: "/tasks?source=offline", label: "Задания" }],
  [/^\/courses\/[^/]+/, { href: "/courses", label: "Курсы" }],
  [/^\/lessons\/[^/]+/, { href: "/courses", label: "Курсы" }],
  [/^\/tests\/[^/]+/, { href: "/tests", label: "Тесты" }],
  [/^\/shared-lessons\/[^/]+/, { href: "/shared-lessons", label: "Уроки от преподавателя" }],
  [/^\/shared-lessons\/?$/, { href: "/monthly-plan", label: "Сектор" }],
  [/^\/online-lessons\/[^/]+/, { href: "/school-lessons?tab=schedule&format=online", label: "Расписание" }],
  [/^\/(monthly-plan|tasks|courses|tests|progress)\/?$/, learning],
  [/^\/(league|board|settings)\/?$/, home],
];

/** An external student (stage 4) has three roots — «Курсы», «Тесты», «Профиль» — and goes one step back to them. */
const externalRules: ReadonlyArray<readonly [RegExp, BackTarget]> = [
  [/^\/courses\/[^/]+/, { href: "/courses", label: "Курсы" }],
  [/^\/lessons\/[^/]+/, { href: "/courses", label: "Курсы" }],
  [/^\/tests\/[^/]+/, { href: "/tests", label: "Тесты" }],
];

export function studentBackTarget(pathname: string, options: { external?: boolean } = {}): BackTarget | null {
  const list = options.external ? externalRules : rules;
  return list.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}
