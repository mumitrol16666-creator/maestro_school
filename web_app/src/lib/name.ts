export interface PersonNameParts {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email?: string | null;
  login?: string | null;
}

function getDeclension(number: number, one: string, two: string, five: string): string {
  let n = Math.abs(number);
  n %= 100;
  if (n >= 5 && n <= 20) return five;
  n %= 10;
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return two;
  return five;
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

export function getAge(dateValue?: string | Date | null): number | null {
  if (!dateValue) return null;
  const birthDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const hasBirthdayPassed = monthDiff > 0 || (monthDiff === 0 && today.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassed) age -= 1;

  if (age < 0 || age > 120) return null;
  return age;
}

export function formatAge(dateValue?: string | Date | null): string {
  const age = getAge(dateValue);
  if (age === null) return "";
  return `${age} ${getDeclension(age, "год", "года", "лет")}`;
}
