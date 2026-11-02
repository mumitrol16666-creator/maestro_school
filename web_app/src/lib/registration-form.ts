/**
 * Stage 4: the checks of the registration form before anything is sent. The server checks the
 * same again; these give the answer on the spot, in words. Pure functions, covered by unit tests.
 */

export const NAME_MAX = 128;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** The digits of a phone the way the server compares them: «8 777…» and «+7 777…» are one number. */
export function phoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) digits = `7${digits.slice(1)}`;
  return digits;
}

export function isValidPhoneInput(phone: string): boolean {
  const digits = phoneDigits(phone);
  return digits.length >= 10 && digits.length <= 15;
}

export interface PersonFields {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}

export type PersonErrors = Partial<Record<keyof PersonFields, string>>;

export interface PersonLabels {
  /** «Укажите имя» / «Укажите имя ребёнка». */
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}

const SELF_LABELS: PersonLabels = {
  firstName: "Укажите имя",
  lastName: "Укажите фамилию",
  phone: "Укажите номер телефона полностью, например +7 777 123-45-67",
  password: `Пароль — не короче ${PASSWORD_MIN} символов`,
};

const CHILD_LABELS: PersonLabels = {
  firstName: "Укажите имя ребёнка",
  lastName: "Укажите фамилию ребёнка",
  phone: "Укажите номер телефона ребёнка полностью, например +7 777 123-45-67",
  password: `Пароль ребёнка — не короче ${PASSWORD_MIN} символов`,
};

export function validatePerson(person: PersonFields, labels: PersonLabels = SELF_LABELS): PersonErrors {
  const errors: PersonErrors = {};
  const firstName = person.firstName.trim();
  const lastName = person.lastName.trim();
  if (!firstName) errors.firstName = labels.firstName;
  else if (firstName.length > NAME_MAX) errors.firstName = "Имя слишком длинное";
  if (!lastName) errors.lastName = labels.lastName;
  else if (lastName.length > NAME_MAX) errors.lastName = "Фамилия слишком длинная";
  if (!isValidPhoneInput(person.phone)) errors.phone = labels.phone;
  if (person.password.length < PASSWORD_MIN) errors.password = labels.password;
  else if (person.password.length > PASSWORD_MAX) errors.password = `Пароль — не длиннее ${PASSWORD_MAX} символов`;
  return errors;
}

export interface StudentRegistrationFields extends PersonFields {
  passwordRepeat: string;
}

export type StudentRegistrationErrors = PersonErrors & { passwordRepeat?: string };

export function validateStudentRegistration(input: StudentRegistrationFields): StudentRegistrationErrors {
  const errors: StudentRegistrationErrors = validatePerson(input);
  if (!errors.password && input.password !== input.passwordRepeat) {
    errors.passwordRepeat = "Пароли не совпадают";
  }
  return errors;
}

export interface ParentRegistrationFields {
  parent: PersonFields;
  child: PersonFields;
}

export interface ParentRegistrationErrors {
  parent: PersonErrors;
  child: PersonErrors;
}

export function validateParentRegistration(input: ParentRegistrationFields): ParentRegistrationErrors {
  const parent = validatePerson(input.parent);
  const child = validatePerson(input.child, CHILD_LABELS);
  // The child signs in by their own phone: it cannot be the parent's (the server refuses it as well).
  if (!parent.phone && !child.phone && phoneDigits(input.parent.phone) === phoneDigits(input.child.phone)) {
    child.phone = "Телефон ребёнка должен отличаться от вашего: ребёнок входит по своему номеру";
  }
  return { parent, child };
}

export function hasErrors(errors: PersonErrors | StudentRegistrationErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function parentRegistrationHasErrors(errors: ParentRegistrationErrors): boolean {
  return hasErrors(errors.parent) || hasErrors(errors.child);
}

/** What goes to the server: names and phones trimmed, passwords as typed. */
export function trimPerson(person: PersonFields): PersonFields {
  return {
    firstName: person.firstName.trim(),
    lastName: person.lastName.trim(),
    phone: person.phone.trim(),
    password: person.password,
  };
}
