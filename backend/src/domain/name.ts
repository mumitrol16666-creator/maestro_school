export interface PersonNameParts {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email?: string | null;
  login?: string | null;
}

export function formatFio(person: PersonNameParts): string {
  const fio = [person.lastName, person.firstName, person.middleName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return fio || person.email || person.login || "";
}
