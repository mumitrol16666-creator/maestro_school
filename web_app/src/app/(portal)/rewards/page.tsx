"use client";

import {
  CheckCircle2,
  Clock3,
  Coins,
  Gift,
  LoaderCircle,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { RankProgressCard } from "@/components/rank-progress-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { rewardsApi } from "@/lib/rewards-api";
import type { RewardCatalogItem, RewardRedemptionStatus } from "@/types/rewards";

const categoryCopy: Record<string, string> = {
  lesson: "На уроке",
  learning: "Для обучения",
  digital: "Персональный материал",
};

const statusCopy: Record<RewardRedemptionStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  requested: { label: "Ждёт подтверждения", className: "bg-amber-50 text-amber-800", icon: Clock3 },
  approved: { label: "Подтверждено", className: "bg-blue-50 text-blue-800", icon: CheckCircle2 },
  fulfilled: { label: "Выдано", className: "bg-emerald-50 text-emerald-800", icon: Gift },
  rejected: { label: "Отклонено · Coins возвращены", className: "bg-red-50 text-red-700", icon: XCircle },
};

export default function RewardsPage() {
  const resource = useApiResource(() => rewardsApi.studentOverview(), []);
  const { refreshUser } = useAuth();
  const [selected, setSelected] = useState<RewardCatalogItem | null>(null);
  const [note, setNote] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resource.loading) return <LoadingState label="Открываем награды" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const data = resource.data;

  async function redeem() {
    if (!selected) return;
    setRedeeming(true);
    setError(null);
    try {
      await rewardsApi.redeem(selected.id, note);
      setSelected(null);
      setNote("");
      await Promise.all([resource.reload(), refreshUser()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось оформить награду");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Maestro Rewards"
        title="Ранги и награды"
        description="Учитесь, повышайте ранг и обменивайте Maestro Coins на полезные награды."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <RankProgressCard rank={data.rank} />
        <section className="rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-soft">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold text-ink">
            <Coins size={23} />
          </span>
          <p className="font-display mt-7 text-4xl">{data.coins.toLocaleString("ru-RU")}</p>
          <p className="mt-1 text-sm font-bold text-amber-900">Maestro Coins доступно</p>
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Coins начисляются за занятия, задания и завершение курсов.
          </p>
        </section>
      </div>

      <section className="mt-9">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Витрина</p>
          <h2 className="font-display mt-2 text-3xl">Выберите награду</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.catalog.map((reward) => {
            const unavailable = reward.stock === 0;
            const canAfford = data.coins >= reward.costCoins;
            return (
              <article key={reward.id} className="flex min-h-[280px] flex-col rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                    <Gift size={22} />
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-900">
                    {reward.costCoins} Coins
                  </span>
                </div>
                <p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">
                  {categoryCopy[reward.category] ?? reward.category}
                </p>
                <h3 className="font-display mt-2 text-2xl">{reward.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-stone-500">{reward.description}</p>
                <button
                  type="button"
                  disabled={unavailable || !canAfford}
                  onClick={() => {
                    setSelected(reward);
                    setError(null);
                  }}
                  className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-bold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
                >
                  <Sparkles size={16} />
                  {unavailable ? "Временно нет" : canAfford ? "Получить награду" : `Не хватает ${reward.costCoins - data.coins}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {data.redemptions.length ? (
        <section className="mt-10 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <h2 className="font-display text-3xl">Мои заявки</h2>
          <div className="mt-5 space-y-3">
            {data.redemptions.map((redemption) => {
              const meta = statusCopy[redemption.status];
              const Icon = meta.icon;
              return (
                <article key={redemption.id} className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{redemption.rewardTitle}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {new Date(redemption.createdAt).toLocaleDateString("ru-RU")} · {redemption.costCoins} Coins
                    </p>
                    {redemption.adminComment ? (
                      <p className="mt-2 text-sm text-stone-600">{redemption.adminComment}</p>
                    ) : null}
                  </div>
                  <span className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-xs font-bold ${meta.className}`}>
                    <Icon size={14} />
                    {meta.label}
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-[30px] bg-paper p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Подтверждение</p>
                <h2 className="font-display mt-2 text-3xl">{selected.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Закрыть" className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200">
                <X size={18} />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-500">
              С баланса спишется <strong className="text-ink">{selected.costCoins} Maestro Coins</strong>.
              Администратор получит заявку и подтвердит выдачу награды.
            </p>
            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий для администратора — необязательно
              <textarea
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Например, какую песню хотите разобрать"
                className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm normal-case tracking-normal outline-none focus:border-gold"
              />
            </label>
            {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelected(null)} className="min-h-12 rounded-2xl border border-stone-200 px-5 text-sm font-bold">
                Отмена
              </button>
              <button type="button" disabled={redeeming} onClick={() => void redeem()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-bold text-white disabled:opacity-60">
                {redeeming ? <LoaderCircle size={16} className="animate-spin" /> : <Coins size={16} />}
                Обменять {selected.costCoins} Coins
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
