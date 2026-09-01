"use client";

import {
  ArrowLeft,
  Coins,
  Check,
  Eye,
  Link2,
  LockKeyhole,
  LoaderCircle,
  ShieldCheck,
  Star,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AchievementsWall } from "@/components/achievements-wall";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { StudentPhoneLine, WhatsAppLink } from "@/components/whatsapp-link";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatFio } from "@/lib/name";
import {
  studentsApi,
  type FamilyRelationship,
  type ParentStudentLink,
} from "@/lib/students-api";
import type { ParentVisibility } from "@/types/family";

export default function AdminStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { user } = useAuth();
  const resource = useApiResource(() => studentsApi.get(studentId), [studentId]);

  if (resource.loading) return <LoadingState label="Открываем карточку ученика" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Ученик не найден" description="Проверьте ссылку." />;

  const student = resource.data;
  const studentName = student.fullName || formatFio(student);

  return (
    <>
      <Link href="/admin/students" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} /> К списку учеников
      </Link>

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Карточка ученика</p>
        <h1 className="font-display mt-2 text-4xl">{studentName}</h1>
        <div className="mt-4">
          <StudentPhoneLine phone={student.phone} login={student.login} email={student.email} />
        </div>
        <div className="mt-4">
          <WhatsAppLink phone={student.phone} label="Написать в WhatsApp" />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard icon={Star} label="Баллы" value={student.points.toLocaleString("ru-RU")} />
          <StatCard icon={Coins} label="Maestro Coins" value={student.coins.toLocaleString("ru-RU")} />
          <StatCard icon={Trophy} label="Пройдено уроков" value={String(student.completedLessons)} />
        </div>
      </section>

      <ParentAccessCard
        studentId={student.id}
        studentName={studentName}
        parents={student.parents}
        reload={resource.reload}
      />

      {user?.productFeatures?.curatorWorkspaceV2 ? (
        <ParentVisibilityCard studentId={student.id} studentName={studentName} />
      ) : null}

      <section className="mt-6 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <h2 className="font-display text-3xl">Достижения</h2>
        <p className="mt-2 text-sm text-stone-500">
          Получено {student.earnedAchievementsCount} из {student.achievements.length}
        </p>
        <div className="mt-5">
          <AchievementsWall achievements={student.achievements} compact />
        </div>
      </section>

      <section className="mt-6">
        <div className="rounded-[28px] border border-stone-200 bg-white p-6">
          <h2 className="font-display text-2xl">Курсы</h2>
          <div className="mt-4 space-y-3">
            {student.enrollments.length ? student.enrollments.map((item) => (
              <div key={item.id} className="rounded-2xl bg-stone-50 p-4">
                <p className="font-semibold text-ink">{item.course.title}</p>
                <p className="mt-1 text-xs text-stone-500">{item.status}</p>
              </div>
            )) : <p className="text-sm text-stone-500">Курсы пока не выбраны</p>}
          </div>
        </div>
      </section>
    </>
  );
}

const visibilityLabels: Array<{ key: keyof ParentVisibility; label: string; description: string }> = [
  { key: "showSchedule", label: "Расписание", description: "Ближайшие занятия ученика" },
  { key: "showBalance", label: "Баланс", description: "Текущая сумма оплаты или задолженности" },
  { key: "showPlanProgress", label: "План месяца", description: "Цель и процент выполнения" },
  { key: "showAchievements", label: "Достижения", description: "Полученные медали ученика" },
];

function ParentVisibilityCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const resource = useApiResource(() => studentsApi.parentVisibility(studentId), [studentId]);
  const [visibility, setVisibility] = useState<ParentVisibility | null>(null);
  const [reason, setReason] = useState("Настройки согласованы администратором");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resource.data) setVisibility(resource.data.policy);
  }, [resource.data]);

  async function save() {
    if (!visibility) return;
    setBusy(true);
    setMessage(null);
    try {
      await studentsApi.updateParentVisibility(studentId, visibility, reason);
      setMessage("Настройки сохранены для всех привязанных родителей");
      await resource.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "approved" | "rejected") {
    const request = resource.data?.pendingRequest;
    if (!request) return;
    setBusy(true);
    setMessage(null);
    try {
      await studentsApi.decideParentVisibilityRequest(studentId, request.id, decision, reason);
      setMessage(decision === "approved" ? "Запрос ученика одобрен" : "Запрос ученика отклонён");
      await resource.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обработать запрос");
    } finally {
      setBusy(false);
    }
  }

  if (resource.loading) return <div className="mt-6"><LoadingState label="Загружаем настройки родителей" /></div>;
  if (resource.error) return <div className="mt-6"><ErrorState message={resource.error} retry={resource.reload} /></div>;
  if (!visibility) return null;

  const pending = resource.data?.pendingRequest;
  return (
    <section className="mt-6 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="parent-visibility-admin">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Доступ родителей</p>
          <h2 className="font-display mt-2 text-3xl">Что видно семье</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Одна настройка для всех родителей {studentName}. Ученик может только отправить запрос, решение принимает администратор.
          </p>
        </div>
        <Eye className="text-gold" />
      </div>

      {pending ? (
        <div className="mt-6 border-l-4 border-gold bg-amber-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Ожидает решения</p>
          <p className="mt-2 text-sm text-amber-950">{pending.note || "Ученик просит изменить доступ родителей."}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-amber-900">
            {visibilityLabels.filter((item) => pending.requested[item.key]).map((item) => <span key={item.key}>{item.label}</span>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void decide("approved")} className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check size={16} />Одобрить</button>
            <button type="button" disabled={busy} onClick={() => void decide("rejected")} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"><X size={16} />Отклонить</button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibilityLabels.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-start gap-3 border-t border-stone-200 py-4">
            <input
              type="checkbox"
              checked={visibility[item.key]}
              onChange={(event) => setVisibility({ ...visibility, [item.key]: event.target.checked })}
              className="mt-0.5 h-5 w-5 accent-[#c59a45]"
            />
            <span><span className="block text-sm font-bold text-ink">{item.label}</span><span className="mt-1 block text-xs text-stone-500">{item.description}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} aria-label="Причина изменения доступа" className="min-w-0 flex-1 rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-gold" />
        <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void save()} className="rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Сохранить доступ</button>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-stone-600">{message}</p> : null}
    </section>
  );
}

const relationshipLabels: Record<FamilyRelationship, string> = {
  mother: "Мама",
  father: "Папа",
  guardian: "Законный представитель",
  other: "Другое",
};

function ParentAccessCard({
  studentId,
  studentName,
  parents,
  reload,
}: {
  studentId: string;
  studentName: string;
  parents: ParentStudentLink[];
  reload: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const [relationship, setRelationship] = useState<FamilyRelationship>("guardian");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [passwordLinkId, setPasswordLinkId] = useState<string | null>(null);
  const [replacementPassword, setReplacementPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === "create") {
        await studentsApi.createParent(studentId, {
          firstName,
          lastName,
          middleName: middleName || undefined,
          phone,
          login,
          password,
          relationship,
        });
        setFirstName("");
        setLastName("");
        setMiddleName("");
        setPhone("");
        setPassword("");
        setSuccess("Родительский аккаунт создан и привязан");
      } else {
        await studentsApi.linkParent(studentId, { login, relationship });
        setSuccess("Существующий родительский аккаунт привязан");
      }
      setLogin("");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось настроить доступ родителя");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(item: ParentStudentLink) {
    if (!window.confirm(`Отключить доступ «${item.parent.fullName}» к карточке ученика?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await studentsApi.unlinkParent(studentId, item.linkId);
      setSuccess("Доступ родителя отключён");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отключить доступ");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent, item: ParentStudentLink) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await studentsApi.resetParentPassword(studentId, item.linkId, replacementPassword);
      setReplacementPassword("");
      setPasswordLinkId(null);
      setSuccess(`Новый пароль для «${item.parent.fullName}» сохранён`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Семейный доступ</p>
          <h2 className="font-display mt-2 text-3xl">Родители</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Родитель видит расписание, ДЗ, итоги уроков и абонемент {studentName}.
            Переписки, курсы и тесты ему недоступны.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800">
          <ShieldCheck size={15} />
          Привязано: {parents.length}
        </span>
      </div>

      {parents.length ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {parents.map((item) => (
            <div key={item.linkId} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{item.parent.fullName}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">
                    {relationshipLabels[item.relationship]}
                  </p>
                  <p className="mt-3 break-words text-xs leading-5 text-stone-500">
                    Логин: {item.parent.login || "не указан"} · Телефон: {item.parent.phone}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPasswordLinkId((current) => current === item.linkId ? null : item.linkId);
                      setReplacementPassword("");
                      setError(null);
                      setSuccess(null);
                    }}
                    aria-label={`Сменить пароль ${item.parent.fullName}`}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-stone-100 text-stone-700 transition hover:bg-stone-200 disabled:opacity-50"
                  >
                    <LockKeyhole size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void unlink(item)}
                    aria-label={`Отключить ${item.parent.fullName}`}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {passwordLinkId === item.linkId ? (
                <form onSubmit={(event) => void resetPassword(event, item)} className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                  <input
                    type="password"
                    value={replacementPassword}
                    onChange={(event) => setReplacementPassword(event.target.value)}
                    minLength={8}
                    maxLength={72}
                    required
                    placeholder="Новый временный пароль"
                    className="min-w-[220px] flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-gold"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Сохранить пароль
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">
          Родительский доступ пока не настроен.
        </p>
      )}

      <div className="mt-7 border-t border-stone-100 pt-7">
        <div className="inline-flex rounded-2xl bg-stone-100 p-1.5">
          <button
            type="button"
            onClick={() => { setMode("create"); setError(null); setSuccess(null); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
              mode === "create" ? "bg-white text-ink shadow-sm" : "text-stone-500"
            }`}
          >
            <UserPlus size={16} />
            Новый родитель
          </button>
          <button
            type="button"
            onClick={() => { setMode("link"); setError(null); setSuccess(null); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
              mode === "link" ? "bg-white text-ink shadow-sm" : "text-stone-500"
            }`}
          >
            <Link2 size={16} />
            Уже есть аккаунт
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          {mode === "create" ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Фамилия" value={lastName} onChange={setLastName} required />
                <Field label="Имя" value={firstName} onChange={setFirstName} required />
                <Field label="Отчество" value={middleName} onChange={setMiddleName} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Телефон"
                  value={phone}
                  onChange={setPhone}
                  placeholder="+7 700 000 00 00"
                  type="tel"
                  maxLength={32}
                  required
                />
                <Field
                  label="Уникальный логин"
                  value={login}
                  onChange={setLogin}
                  placeholder="parent_anna"
                  maxLength={32}
                  required
                />
                <Field label="Временный пароль" value={password} onChange={setPassword} type="password" minLength={8} required />
              </div>
            </>
          ) : (
            <div className="max-w-xl">
              <Field
                label="Логин существующего родителя"
                value={login}
                onChange={setLogin}
                placeholder="parent_anna"
                maxLength={32}
                required
              />
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Так один родительский профиль можно безопасно привязать к нескольким детям.
              </p>
            </div>
          )}

          <label className="block max-w-sm">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Кем приходится</span>
            <select
              value={relationship}
              onChange={(event) => setRelationship(event.target.value as FamilyRelationship)}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-gold"
            >
              {(Object.entries(relationshipLabels) as [FamilyRelationship, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          {success ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : mode === "create" ? <UserPlus size={16} /> : <Link2 size={16} />}
            {mode === "create" ? "Создать и привязать" : "Привязать аккаунт"}
          </button>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  minLength,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength ?? (type === "password" ? 72 : 128)}
        inputMode={type === "tel" ? "tel" : undefined}
        autoCapitalize={type === "tel" || label.toLocaleLowerCase("ru-RU").includes("логин") ? "none" : undefined}
        spellCheck={label.toLocaleLowerCase("ru-RU").includes("логин") ? false : undefined}
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none focus:border-gold"
      />
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <Icon size={18} className="text-gold" />
      <p className="font-display mt-4 text-3xl">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{label}</p>
    </div>
  );
}
