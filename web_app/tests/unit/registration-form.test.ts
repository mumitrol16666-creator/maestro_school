import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasErrors,
  isValidPhoneInput,
  parentRegistrationHasErrors,
  phoneDigits,
  trimPerson,
  validateAddedChild,
  validateParentRegistration,
  validatePerson,
  validateStudentRegistration,
} from "../../src/lib/registration-form";

const good = { firstName: "Алия", lastName: "Серикова", phone: "+7 777 123-45-67", password: "Maestro2026" };

test("phones are compared by digits, «8» and «+7» are one number", () => {
  assert.equal(phoneDigits("+7 (777) 123-45-67"), "77771234567");
  assert.equal(phoneDigits("8 777 123 45 67"), "77771234567");
  assert.equal(isValidPhoneInput("+7 777 123-45-67"), true);
  assert.equal(isValidPhoneInput("777 123"), false);
  assert.equal(isValidPhoneInput(""), false);
  assert.equal(isValidPhoneInput("1234567890123456"), false);
});

test("a correct person has no errors", () => {
  assert.deepEqual(validatePerson(good), {});
});

test("every empty or short field is named", () => {
  const errors = validatePerson({ firstName: " ", lastName: "", phone: "12", password: "short" });
  assert.deepEqual(Object.keys(errors).sort(), ["firstName", "lastName", "password", "phone"]);
  assert.equal(errors.firstName, "Укажите имя");
  assert.match(errors.password ?? "", /8 символов/);
});

test("a password of 73 characters is refused like the server does", () => {
  assert.match(validatePerson({ ...good, password: "a".repeat(73) }).password ?? "", /72/);
  assert.equal(validatePerson({ ...good, password: "a".repeat(72) }).password, undefined);
});

test("the student repeats the password", () => {
  assert.deepEqual(validateStudentRegistration({ ...good, passwordRepeat: good.password }), {});
  assert.equal(validateStudentRegistration({ ...good, passwordRepeat: "other" }).passwordRepeat, "Пароли не совпадают");
  // A short password is the error; the repeat is not blamed on top of it.
  const errors = validateStudentRegistration({ ...good, password: "short", passwordRepeat: "other" });
  assert.equal(errors.passwordRepeat, undefined);
  assert.ok(errors.password);
});

test("the parent and the child are checked each on their own", () => {
  const child = { firstName: "Дамир", lastName: "Серик", phone: "+7 701 000-11-22", password: "Child2026!" };
  const ok = validateParentRegistration({ parent: good, child });
  assert.equal(parentRegistrationHasErrors(ok), false);

  const bad = validateParentRegistration({ parent: { ...good, firstName: "" }, child: { ...child, password: "1" } });
  assert.equal(bad.parent.firstName, "Укажите имя");
  assert.match(bad.child.password ?? "", /Пароль ребёнка/);
  assert.equal(parentRegistrationHasErrors(bad), true);
});

test("the child cannot have the phone of the parent, however it is written", () => {
  const same = validateParentRegistration({
    parent: good,
    child: { ...good, firstName: "Дамир", phone: "8 777 123 45 67" },
  });
  assert.match(same.child.phone ?? "", /должен отличаться/);
  assert.equal(same.parent.phone, undefined);
  assert.equal(parentRegistrationHasErrors(same), true);
});

test("the check of equal phones does not hide a wrong phone", () => {
  const errors = validateParentRegistration({
    parent: { ...good, phone: "12" },
    child: { ...good, phone: "12" },
  });
  assert.match(errors.parent.phone ?? "", /Укажите номер/);
  assert.match(errors.child.phone ?? "", /ребёнка/);
});

test("names and phones are trimmed before sending, the password never", () => {
  assert.deepEqual(
    trimPerson({ firstName: " Алия ", lastName: " Серикова", phone: " +7 777 ", password: " pass word " }),
    { firstName: "Алия", lastName: "Серикова", phone: "+7 777", password: " pass word " },
  );
  assert.equal(hasErrors({}), false);
  assert.equal(hasErrors({ phone: "x" }), true);
});

test("«Добавить ребёнка»: the child's fields are checked, and the phone cannot be the parent's", () => {
  assert.deepEqual(validateAddedChild(good, "+7 701 000-00-00"), {});
  assert.deepEqual(validateAddedChild(good, null), {}, "a parent without a phone in the session: the server checks");
  assert.match(validateAddedChild(good, "8 777 123 45 67").phone ?? "", /отличаться/);
  assert.equal(validateAddedChild({ ...good, firstName: "" }, null).firstName, "Укажите имя ребёнка");
  assert.match(validateAddedChild({ ...good, phone: "12" }, "12").phone ?? "", /телефона ребёнка/, "a broken phone is named as broken, not as the parent's");
});
