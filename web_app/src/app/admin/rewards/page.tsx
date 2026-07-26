"use client";

import {
  Check,
  CheckCircle2,
  Coins,
  Gift,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { rewardsApi } from "@/lib/rewards-api";
import type {
  RewardCatalogInput,
  RewardCatalogItem,
  RewardRedemption,
  RewardRedemptionStatus,
} from "@/types/rewards";

type RewardForm = {
  title: string;
  description: string;
  category: string;
  costCoins: number;
  stock: string;
  isActive: boolean;
  sortOrder: number;
};

const emptyForm: RewardForm = {
  title: "",
  description: "",
  category: "learning",
  costCoins: 20,
  stock: "",
  isActive: true,
  sortOrder: 0,
};

const statusLabel: Record<RewardRedemptionStatus, string> = {
  requested: "Новая",
  approved: "Подтверждена",
  fulfilled: "Выдана",
  rejected: "Отклонена",
};

const statusClass: Record<RewardRedemptionStatus, string> = {
  requested: "bg-amber-50 text-amber-800",
  approved: "bg-blue-50 text-blue-800",
  fulfilled: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
};

export default function AdminRewardsPage() {
  const resource = useApiResource(() => rewardsApi.adminOverview(), []);
  const [editing, setEditing] = useState<RewardCatalogItem | null>(null);
  const [form, setForm] = useState<RewardForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RewardRedemption | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [requestFilter, setRequestFilter] = useState<"active" | "all">("active");
  const [error, setError] = useState<string | null>(null);

  const visibleRedemptions = useMemo(() => {
    const items = resource.data?.redemptions ?? [];
    return requestFilter === "active"
      ? items.filter((item) => item.status === "requested" || item.status === "approved")
      : items;
  }, [requestFilter, resource.data?.redemptions]);

  if (resource.loading) return <LoadingState label="Загружаем награды" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  function startEdit(item: RewardCatalogItem) {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description,
      category: item.category,
      costCoins: item.costCoins,
      stock: item.stock == null ? "" : String(item.stock),
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    });
    setError(null);
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body: RewardCatalogInput = {
      title: form.title,
      description: form.description,
      category: form.category,
      costCoins: form.costCoins,
      stock: form.stock.trim() === "" ? null : Number(form.stock),
      isActive: form.isActive,
      sortOrder: form.sortOrder,
    };
    try {
      if (editing) await rewardsApi.update(editing.id, body);
      else await rewardsApi.create(body);
      resetForm();
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить награду");
    } finally {
      setSaving(false);
    }
  }

  async function process(
    redemption: RewardRedemption,
    status: "approved" | "fulfilled" | "rejected",
    adminComment = "",
  ) {
    setProcessing(redemption.id);
    setError(null);
    try {
      await rewardsApi.process(redemption.id, status, adminComment);
      await resource.reload();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось обновить заявку");
      return false;
    } finally {
      setProcessing(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Maestro Rewards"
        title="Награды"
        description="Управляйте витриной и подтверждайте обмен Maestro Coins."
      />

      {error ? (
        <p className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Обмен Coins</p>
            <h2 className="font-display mt-2 text-3xl">Заявки учеников</h2>
          </div>
          <div className="flex rounded-xl border border-stone-200 bg-stone-50 p-1">
            <button
              type="button"
              onClick={() => setRequestFilter("active")}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${requestFilter === "active" ? "bg-white text-ink shadow-sm" : "text-stone-500"}`}
            >
              В работе
            </button>
            <button
              type="button"
              onClick={() => setRequestFilter("all")}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${requestFilter === "all" ? "bg-white text-ink shadow-sm" : "text-stone-500"}`}
            >
              Все
            </button>
          </div>
        </div>

        {!visibleRedemptions.length ? (
          <div className="mt-6">
            <EmptyState title="Заявок пока нет" description="Новые обмены Coins появятся здесь." />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {visibleRedemptions.map((redemption) => {
              const student = redemption.student;
              const studentName = student
                ? [student.lastName, student.firstName, student.middleName].filter(Boolean).join(" ")
                : "Ученик";
              const busy = processing === redemption.id;
              return (
                <article key={redemption.id} className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-xl">{redemption.rewardTitle}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClass[redemption.status]}`}>
                          {statusLabel[redemption.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-bold">{studentName}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {redemption.costCoins} Coins · {new Date(redemption.createdAt).toLocaleString("ru-RU")}
                      </p>
                      {redemption.studentNote ? (
                        <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
                          {redemption.studentNote}
                        </p>
                      ) : null}
                      {redemption.adminComment ? (
                        <p className="mt-2 text-xs text-stone-500">Комментарий: {redemption.adminComment}</p>
                      ) : null}
                    </div>
                    {redemption.status === "requested" || redemption.status === "approved" ? (
                      <div className="flex flex-wrap gap-2">
                        {redemption.status === "requested" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void process(redemption, "approved")}
                            className={secondaryButton}
                          >
                            <Check size={15} /> Подтвердить
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void process(redemption, "fulfilled")}
                          className={primaryButton}
                        >
                          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <PackageCheck size={15} />}
                          Выдано
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRejecting(redemption);
                            setRejectReason("");
                            setError(null);
                          }}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700"
                        >
                          <XCircle size={15} /> Отклонить
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_390px]">
        <section>
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Витрина</p>
            <h2 className="font-display mt-2 text-3xl">Каталог наград</h2>
          </div>
          <div className="space-y-3">
            {resource.data.catalog.map((item) => (
              <article key={item.id} className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.isActive ? "bg-violet-50 text-violet-700" : "bg-stone-100 text-stone-400"}`}>
                    <Gift size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl">{item.title}</h3>
                      {!item.isActive ? <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-500">Скрыто</span> : null}
                    </div>
                    <p className="mt-1 text-xs font-bold text-gold">
                      {item.costCoins} Coins · {item.stock == null ? "без лимита" : `остаток ${item.stock}`} · заявок {item._count?.redemptions ?? 0}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-stone-500">{item.description}</p>
                  </div>
                  <button type="button" onClick={() => startEdit(item)} className={secondaryButton}>
                    <Pencil size={15} /> Изменить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <form onSubmit={save} className="h-fit rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
            {editing ? "Редактирование" : "Новая награда"}
          </p>
          <div className="mt-5 space-y-4">
            <input
              required
              minLength={2}
              maxLength={255}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Название награды"
              className={inputClass}
            />
            <textarea
              required
              minLength={5}
              maxLength={2000}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Что именно получит ученик"
              className={`${inputClass} min-h-28`}
            />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>
              <option value="learning">Для обучения</option>
              <option value="lesson">На уроке</option>
              <option value="digital">Персональный материал</option>
              <option value="physical">Физический подарок</option>
            </select>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Цена в Maestro Coins
              <input
                type="number"
                min={1}
                required
                value={form.costCoins}
                onChange={(event) => setForm({ ...form, costCoins: Number(event.target.value) })}
                className={`${inputClass} mt-2`}
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Остаток
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(event) => setForm({ ...form, stock: event.target.value })}
                placeholder="Пусто = без лимита"
                className={`${inputClass} mt-2`}
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Порядок
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                className={`${inputClass} mt-2`}
              />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Показывать ученикам
            </label>
            <button type="submit" disabled={saving} className={`${primaryButton} w-full`}>
              {saving ? <LoaderCircle size={16} className="animate-spin" /> : editing ? <CheckCircle2 size={16} /> : <Plus size={16} />}
              {editing ? "Сохранить" : "Создать награду"}
            </button>
            {editing ? (
              <button type="button" onClick={resetForm} className={`${secondaryButton} w-full`}>
                Отмена
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="reject-reward-title" className="w-full max-w-lg rounded-[30px] bg-paper p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Отказ в награде</p>
                <h2 id="reject-reward-title" className="font-display mt-2 text-3xl">{rejecting.rewardTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setRejecting(null)}
                aria-label="Закрыть"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-500">
              Ученику автоматически вернутся{" "}
              <strong className="text-ink">{rejecting.costCoins} Maestro Coins</strong>.
              Укажите короткую причину — она появится в его истории заявок.
            </p>
            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Причина отказа
              <textarea
                autoFocus
                required
                minLength={3}
                maxLength={500}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Например, уточните другую песню для разбора"
                className={`${inputClass} mt-2 min-h-28 normal-case tracking-normal`}
              />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className={secondaryButton}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={processing === rejecting.id || rejectReason.trim().length < 3}
                onClick={() => {
                  void process(rejecting, "rejected", rejectReason).then((completed) => {
                    if (completed) {
                      setRejecting(null);
                      setRejectReason("");
                    }
                  });
                }}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing === rejecting.id ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <XCircle size={16} />
                )}
                Отклонить и вернуть {rejecting.costCoins} Coins
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
