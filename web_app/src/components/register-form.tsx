"use client";

import { Eye, EyeOff, LoaderCircle, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError, storeSession } from "@/lib/api-client";
import { registerParent } from "@/lib/course-access-api";
import {
  hasErrors,
  parentRegistrationHasErrors,
  trimPerson,
  validateParentRegistration,
  validateStudentRegistration,
  type ParentRegistrationErrors,
  type PersonErrors,
  type PersonFields,
  type StudentRegistrationErrors,
} from "@/lib/registration-form";

type Tab = "student" | "parent";

const EMPTY_PERSON: PersonFields = { firstName: "", lastName: "", phone: "", password: "" };

/** The words the person reads instead of an English or empty server answer. */
export function registrationErrorText(reason: unknown): string {
  if (reason instanceof ApiError) {
    if (reason.code === "NETWORK_ERROR") {
      return typeof navigator !== "undefined" && !navigator.onLine
        ? "Нет связи. Проверьте интернет и попробуйте снова."
        : "Сервер Maestro сейчас не отвечает. Попробуйте через минуту.";
    }
    if (reason.status === 429) return "Слишком много попыток. Подождите минуту и попробуйте снова.";
    if (/[а-яё]/i.test(reason.message)) return reason.message;
  }
  return "Не удалось создать аккаунт. Проверьте данные и попробуйте ещё раз.";
}

function TextField({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: "tel" | "text";
}) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`brand-input py-3.5 ${error ? "border-red-400" : ""}`}
      />
      {error ? (
        <p id={messageId} role="alert" className="mt-2 text-xs font-semibold leading-5 text-red-700" data-testid={`error-${name}`}>{error}</p>
      ) : hint ? (
        <p id={messageId} className="mt-2 text-xs leading-5 text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

function PasswordField({
  label,
  name,
  value,
  onChange,
  error,
  autoComplete = "new-password",
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{label}</label>
      <span className={`flex items-center rounded-xl border bg-paper pr-1 focus-within:border-gold ${error ? "border-red-400" : "border-stone-300"}`}>
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          maxLength={72}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"
        >
          {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      {error ? (
        <p id={messageId} role="alert" className="mt-2 text-xs font-semibold leading-5 text-red-700" data-testid={`error-${name}`}>{error}</p>
      ) : hint ? (
        <p id={messageId} className="mt-2 text-xs leading-5 text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function PersonFieldset({
  prefix,
  title,
  person,
  errors,
  onChange,
  phoneHint,
  passwordHint,
  autoCompleteUser,
}: {
  prefix: string;
  title?: string;
  person: PersonFields;
  errors: PersonErrors;
  /** A state setter: each field is written over the latest person, so fast typing or autofill loses nothing. */
  onChange: Dispatch<SetStateAction<PersonFields>>;
  phoneHint: string;
  passwordHint?: string;
  autoCompleteUser: boolean;
}) {
  const set = (key: keyof PersonFields) => (value: string) => onChange((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-4">
      {title ? <h2 className="font-display text-2xl">{title}</h2> : null}
      <TextField label="Имя" name={`${prefix}FirstName`} value={person.firstName} onChange={set("firstName")} error={errors.firstName} autoComplete={autoCompleteUser ? "given-name" : "off"} />
      <TextField label="Фамилия" name={`${prefix}LastName`} value={person.lastName} onChange={set("lastName")} error={errors.lastName} autoComplete={autoCompleteUser ? "family-name" : "off"} />
      <TextField
        label="Телефон"
        name={`${prefix}Phone`}
        type="tel"
        inputMode="tel"
        value={person.phone}
        onChange={set("phone")}
        error={errors.phone}
        autoComplete={autoCompleteUser ? "tel" : "off"}
        placeholder="+7 777 123-45-67"
        hint={phoneHint}
      />
      <PasswordField label="Пароль" name={`${prefix}Password`} value={person.password} onChange={set("password")} error={errors.password} hint={passwordHint ?? "Не короче 8 символов"} />
    </div>
  );
}

/**
 * Stage 4: the registration. Two tabs — a student for themselves and a parent who registers the
 * child too. No phone confirmation. After success the person is signed in and sent on: the
 * student to the courses, the parent to the family cabinet.
 */
export function RegisterForm({ initial, registering }: { initial?: Partial<PersonFields>; registering?: MutableRefObject<boolean> }) {
  const router = useRouter();
  const { register, refreshUser } = useAuth();
  const [tab, setTab] = useState<Tab>("student");
  const [student, setStudent] = useState<PersonFields>({ ...EMPTY_PERSON, ...initial });
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [parent, setParent] = useState<PersonFields>(EMPTY_PERSON);
  const [child, setChild] = useState<PersonFields>(EMPTY_PERSON);
  const [studentErrors, setStudentErrors] = useState<StudentRegistrationErrors>({});
  const [parentErrors, setParentErrors] = useState<ParentRegistrationErrors>({ parent: {}, child: {} });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ text: string; phoneTaken: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The form of the other tab must not keep the old answer on the screen.
  useEffect(() => {
    setError(null);
  }, [tab]);

  function focusFirstError() {
    window.requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      target?.focus();
    });
  }

  async function submitStudent() {
    const errors = validateStudentRegistration({ ...student, passwordRepeat });
    setStudentErrors(errors);
    if (hasErrors(errors)) {
      focusFirstError();
      return;
    }
    const person = trimPerson(student);
    await register({ firstName: person.firstName, lastName: person.lastName, phone: person.phone, password: person.password });
    router.replace("/courses");
  }

  async function submitParent() {
    const errors = validateParentRegistration({ parent, child });
    setParentErrors(errors);
    if (parentRegistrationHasErrors(errors)) {
      focusFirstError();
      return;
    }
    const session = await registerParent({ parent: trimPerson(parent), child: trimPerson(child) });
    storeSession(session.token, session.user);
    await refreshUser();
    router.replace("/family");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    if (registering) registering.current = true;
    try {
      if (tab === "student") await submitStudent();
      else await submitParent();
    } catch (reason) {
      if (registering) registering.current = false;
      setError({ text: registrationErrorText(reason), phoneTaken: reason instanceof ApiError && reason.status === 409 });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-7 space-y-6" data-testid="register-form" data-tab={tab}>
      <div role="tablist" aria-label="Кто регистрируется" className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1.5">
        {([
          { value: "student", label: "Я ученик", icon: UserRound },
          { value: "parent", label: "Я родитель, регистрирую ребёнка", icon: UsersRound },
        ] as const).map((item) => {
          const Icon = item.icon;
          const selected = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item.value)}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 text-center text-xs font-bold leading-4 transition sm:text-sm ${
                selected ? "bg-charcoal text-white shadow-sm" : "text-stone-600 hover:bg-white hover:text-ink"
              }`}
            >
              <Icon size={16} className={`shrink-0 ${selected ? "text-gold-ink" : ""}`} />
              <span className="min-w-0 break-words">{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "student" ? (
        <div className="space-y-4" role="tabpanel" aria-label="Я ученик">
          <PersonFieldset
            prefix="student"
            person={student}
            errors={studentErrors}
            onChange={setStudent}
            phoneHint="По этому номеру ты будешь входить в приложение"
            autoCompleteUser
          />
          <PasswordField label="Повтори пароль" name="studentPasswordRepeat" value={passwordRepeat} onChange={setPasswordRepeat} error={studentErrors.passwordRepeat} />
        </div>
      ) : (
        <div className="space-y-8" role="tabpanel" aria-label="Я родитель, регистрирую ребёнка">
          <PersonFieldset
            prefix="parent"
            title="Вы"
            person={parent}
            errors={parentErrors.parent}
            onChange={setParent}
            phoneHint="По этому номеру вы будете входить в семейный кабинет"
            autoCompleteUser
          />
          <PersonFieldset
            prefix="child"
            title="Ребёнок"
            person={child}
            errors={parentErrors.child}
            onChange={setChild}
            phoneHint="Ребёнок будет входить по своему телефону и паролю"
            passwordHint="Не короче 8 символов. Передайте пароль ребёнку"
            autoCompleteUser={false}
          />
        </div>
      )}

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" data-testid="register-error">
          <p>{error.text}</p>
          {error.phoneTaken ? (
            <p className="mt-2 font-medium">
              Уже есть аккаунт? <Link href="/login" className="font-bold underline">Войдите</Link> или укажите другой номер.
            </p>
          ) : null}
        </div>
      ) : null}

      <button type="submit" disabled={submitting} className="brand-button-primary w-full py-3.5" data-testid="register-submit">
        {submitting ? (
          <><LoaderCircle size={17} className="animate-spin" /> Создаём аккаунт…</>
        ) : tab === "student" ? "Зарегистрироваться" : "Создать аккаунты"}
      </button>
    </form>
  );
}
