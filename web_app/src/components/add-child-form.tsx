"use client";

import { LoaderCircle, UserPlus } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PersonFieldset, registrationErrorText } from "@/components/register-form";
import { familyApi } from "@/lib/family-api";
import { hasErrors, trimPerson, validateAddedChild, type PersonErrors, type PersonFields } from "@/lib/registration-form";
import type { FamilyChild } from "@/types/family";

const EMPTY_CHILD: PersonFields = { firstName: "", lastName: "", phone: "", password: "" };

/**
 * Stage 4: «Добавить ребёнка» in the family cabinet. A parent who already has an account makes one
 * more child account: the child's own phone and password, the same rules as in the registration
 * form. The school gets a lead about the child.
 */
export function AddChildForm({ onAdded }: { onAdded: (child: FamilyChild) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState<PersonFields>(EMPTY_CHILD);
  const [errors, setErrors] = useState<PersonErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    setOpen(false);
    setChild(EMPTY_CHILD);
    setErrors({});
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validateAddedChild(child, user?.phone);
    setErrors(found);
    setError(null);
    if (hasErrors(found)) {
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setSubmitting(true);
    try {
      const added = await familyApi.addChild(trimPerson(child));
      close();
      onAdded(added);
    } catch (reason) {
      setError(registrationErrorText(reason));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="brand-button-secondary" data-testid="add-child-open">
        <UserPlus size={17} className="shrink-0" /> Добавить ребёнка
      </button>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="brand-card w-full space-y-5 p-5 sm:p-7" data-testid="add-child-form">
      <div>
        <h2 className="font-display text-2xl">Новый ребёнок</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Ребёнок будет входить в приложение по своему телефону и паролю. Школа получит заявку и свяжется с вами.
          Если ребёнок уже учится в Maestro, новый аккаунт не нужен: его привязывает администратор школы.
        </p>
      </div>
      <PersonFieldset
        prefix="child"
        person={child}
        errors={errors}
        onChange={setChild}
        phoneHint="Свой номер ребёнка, не ваш: по нему он будет входить"
        passwordHint="Не короче 8 символов. Передайте пароль ребёнку"
        autoCompleteUser={false}
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" data-testid="add-child-error">{error}</p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={submitting} className="brand-button-primary" data-testid="add-child-submit">
          {submitting ? <><LoaderCircle size={17} className="animate-spin" /> Создаём аккаунт…</> : "Создать аккаунт ребёнка"}
        </button>
        <button type="button" onClick={close} disabled={submitting} className="brand-button-secondary">Отмена</button>
      </div>
    </form>
  );
}
