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

export function initialsFromName(person: PersonNameParts): string {
  if (person.lastName && person.firstName) return `${person.lastName[0]}${person.firstName[0]}`.toUpperCase();
  return formatFio(person).slice(0, 2).toUpperCase();
}
