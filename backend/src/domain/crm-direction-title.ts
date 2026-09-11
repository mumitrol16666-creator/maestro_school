export function normalizeCrmDirectionTitle(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru");
}

export function crmDirectionTitlesMatch(left: string, right: string) {
  return normalizeCrmDirectionTitle(left) === normalizeCrmDirectionTitle(right);
}
