"use client";

import {
  BookOpenCheck,
  Calendar,
  CheckCircle2,
  Clock3,
  Coffee,
  Coins,
  Crown,
  Gift,
  LoaderCircle,
  Music,
  Percent,
  Sparkles,
  Tag,
  Trophy,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { SuccessModal } from "@/components/success-modal";
import { useDialogBehavior } from "@/hooks/use-dialog-behavior";
import { useApiResource } from "@/hooks/use-api-resource";
import { rewardsApi } from "@/lib/rewards-api";
import type { RewardCatalogItem, RewardRedemptionStatus } from "@/types/rewards";

const categoryCopy: Record<string, string> = {
  accessories: "Расходники",
  merch: "Стикеры",
  beverage: "Напитки и уют",
  digital: "Цифровая награда",
  rehearsal: "Практика",
  studio: "Творчество",
  discount: "Абонемент",
  lesson: "На уроке",
  learning: "Для обучения",
};

function getCategoryStyle(category: string) {
  switch (category) {
    case "accessories":
      return { bg: "bg-blue-50 text-blue-700", icon: Music };
    case "merch":
      return { bg: "bg-rose-50 text-rose-700", icon: Tag };
    case "beverage":
      return { bg: "bg-amber-50 text-amber-800", icon: Coffee };
    case "digital":
      return { bg: "bg-yellow-50 text-yellow-800", icon: Crown };
    case "rehearsal":
      return { bg: "bg-emerald-50 text-emerald-800", icon: Calendar };
    case "studio":
      return { bg: "bg-purple-50 text-purple-700", icon: Video };
    case "discount":
      return { bg: "bg-teal-50 text-teal-800", icon: Percent };
    default:
      return { bg: "bg-violet-50 text-violet-700", icon: Gift };
  }
}

const statusCopy: Record<RewardRedemptionStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  requested: { label: "Ждёт подтверждения", className: "bg-amber-50 text-amber-800", icon: Clock3 },
  approved: { label: "Подтверждено", className: "bg-blue-50 text-blue-800", icon: CheckCircle2 },
  fulfilled: { label: "Выдано", className: "bg-emerald-50 text-emerald-800", icon: Gift },
  rejected: { label: "Отклонено · Coins возвращены", className: "bg-red-50 text-red-700", icon: XCircle },
};

const coinSources = [
  {
    icon: Calendar,
    title: "Подтверждённое занятие",
    reward: "+50 Coins",
    description: "За каждое из первых двух занятий недели. Третье и следующие занятия Coins не начисляют.",
  },
  {
    icon: Trophy,
    title: "Недельная цель",
    reward: "+25 Coins",
    description: "За 80 XP, набранных за текущую неделю.",
  },
  {
    icon: Crown,
    title: "Место в недельной лиге",
    reward: "+150 / 100 / 50",
    description: "За первое, второе или третье место после подведения итогов недели.",
  },
  {
    icon: Sparkles,
    title: "Серия активных недель",
    reward: "+50–500 Coins",
    description: "Один раз за рубежи 4, 8, 12, 24 и 52 недели: 50, 100, 150, 250 и 500 Coins.",
  },
  {
    icon: BookOpenCheck,
    title: "Завершение курса",
    reward: "до +100 Coins",
    description: "Один раз, если для курса заранее настроена награда за полное завершение.",
  },
  {
    icon: Gift,
    title: "Особое достижение",
    reward: "+1–1 000 Coins",
    description: "Куратор может начислить награду за концерт, выступление или другое подтверждённое достижение.",
  },
] as const;

export default function RewardsPage() {
  const resource = useApiResource(() => rewardsApi.studentOverview(), []);
  const { refreshUser } = useAuth();
  const [selected, setSelected] = useState<RewardCatalogItem | null>(null);
  const [note, setNote] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<{
    title: string;
    costCoins: number;
    remainingCoins: number;
  } | null>(null);
  const [coinGuideOpen, setCoinGuideOpen] = useState(false);
  const confirmationRef = useDialogBehavior(
    Boolean(selected),
    () => setSelected(null),
    { canClose: !redeeming },
  );
  const coinGuideRef = useDialogBehavior(
    coinGuideOpen,
    () => setCoinGuideOpen(false),
  );

  if (resource.loading) return <LoadingState label="Открываем магазин" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const data = resource.data;

  async function redeem() {
    if (!selected) return;
    const reward = selected;
    setRedeeming(true);
    setError(null);
    try {
      await rewardsApi.redeem(reward.id, note);
      setSelected(null);
      setNote("");
      setRedeemed({
        title: reward.title,
        costCoins: reward.costCoins,
        remainingCoins: Math.max(0, data.coins - reward.costCoins),
      });
      void Promise.all([resource.reload(), refreshUser()]).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось оформить награду");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Магазин Maestro · За Coins"
        title="Магазин"
        description="Товары и возможности, которые можно получить за накопленные Coins."
        action={(
          <button
            type="button"
            onClick={() => setCoinGuideOpen(true)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-bold text-white transition hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto"
            aria-haspopup="dialog"
          >
            <Trophy size={17} />
            Как получить Coins
          </button>
        )}
      />

      <section className="flex flex-col gap-4 border-y border-amber-200 bg-amber-50/60 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gold text-ink">
            <Coins size={21} />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-900">Доступный баланс</p>
            <p className="font-display mt-1 text-3xl text-ink">{data.coins.toLocaleString("ru-RU")} Coins</p>
          </div>
        </div>
        <p className="max-w-sm text-xs leading-5 text-stone-600 sm:text-right">
          Coins списываются при отправке заявки и возвращаются, если администратор её отклонит.
        </p>
      </section>

      <section className="mt-7">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Витрина за Coins</p>
          <h2 className="font-display mt-2 text-3xl">Выберите товар или возможность</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.catalog.map((reward) => {
            const unavailable = reward.stock === 0;
            const canAfford = data.coins >= reward.costCoins;
            const catStyle = getCategoryStyle(reward.category);
            const CatIcon = catStyle.icon;
            return (
              <article key={reward.id} className="flex min-h-[280px] flex-col rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${catStyle.bg}`}>
                    <CatIcon size={22} />
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
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            disabled={redeeming}
            onClick={() => setSelected(null)}
            className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px] disabled:cursor-wait"
            aria-label="Закрыть подтверждение по фону"
          />
          <section
            ref={confirmationRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-redemption-title"
            aria-describedby="reward-redemption-description"
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-xl bg-paper px-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 shadow-2xl sm:rounded-xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Подтверждение</p>
                <h2 id="reward-redemption-title" className="font-display mt-2 text-3xl">{selected.title}</h2>
              </div>
              <button
                type="button"
                disabled={redeeming}
                onClick={() => setSelected(null)}
                aria-label="Закрыть"
                className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:border-stone-300 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <p id="reward-redemption-description" className="mt-4 text-sm leading-6 text-stone-600">
              С баланса спишется <strong className="text-ink">{selected.costCoins} Maestro Coins</strong>.
              Администратор получит заявку и подтвердит выдачу награды.
            </p>
            <div className="mt-5 grid grid-cols-2 border-y border-stone-200 py-4">
              <div className="border-r border-stone-200 pr-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">Сейчас</p>
                <p className="mt-1 text-xl font-black text-ink">{data.coins.toLocaleString("ru-RU")} Coins</p>
              </div>
              <div className="pl-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">После заявки</p>
                <p className="mt-1 text-xl font-black text-emerald-800">
                  {Math.max(0, data.coins - selected.costCoins).toLocaleString("ru-RU")} Coins
                </p>
              </div>
            </div>
            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий для администратора — необязательно
              <textarea
                value={note}
                name="rewardNote"
                autoComplete="off"
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Например, какую песню хотите разобрать…"
                className="mt-2 min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm normal-case tracking-normal outline-none transition-colors focus:border-gold focus-visible:ring-2 focus-visible:ring-amber-100"
              />
            </label>
            {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={redeeming} onClick={() => setSelected(null)} className="min-h-12 rounded-lg border border-stone-200 px-5 text-sm font-bold transition-colors hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50">
                Отмена
              </button>
              <button type="button" disabled={redeeming} onClick={() => void redeem()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60">
                {redeeming ? <LoaderCircle size={16} className="animate-spin" /> : <Coins size={16} />}
                Обменять {selected.costCoins} Coins
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {coinGuideOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            onClick={() => setCoinGuideOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px]"
            aria-label="Закрыть правила Coins по фону"
          />
          <section
            ref={coinGuideRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coins-guide-title"
            aria-describedby="coins-guide-description"
            data-testid="coins-guide-dialog"
            className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-xl bg-paper px-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 shadow-2xl sm:rounded-xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Maestro Coins</p>
                <h2 id="coins-guide-title" className="font-display mt-2 text-3xl text-ink sm:text-4xl">
                  Как получить Coins
                </h2>
                <p id="coins-guide-description" className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                  Coins — внутренняя валюта магазина наград. Они не влияют на LEVEL и не сгорают в конце недели.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCoinGuideOpen(false)}
                aria-label="Закрыть"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:border-stone-300 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 border-y border-amber-200 bg-amber-50/70 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold text-ink">
                  <Coins size={19} />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-900">Ваш баланс</p>
                  <p className="mt-1 text-xl font-black text-ink">{data.coins.toLocaleString("ru-RU")} Coins</p>
                </div>
              </div>
              <p className="hidden max-w-xs text-right text-xs leading-5 text-stone-600 sm:block">
                При отклонении заявки потраченные Coins возвращаются на баланс.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {coinSources.map((source) => {
                const SourceIcon = source.icon;
                return (
                  <article key={source.title} data-testid="coin-source" className="flex gap-3 border-b border-stone-200 px-1 pb-4 sm:min-h-36 sm:border sm:border-stone-200 sm:p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-950 text-gold">
                      <SourceIcon size={18} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h3 className="text-sm font-black text-ink">{source.title}</h3>
                        <span className="text-sm font-black text-amber-700">{source.reward}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-stone-600">{source.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-5 border-l-4 border-gold bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700">
              За отправку ДЗ или прохождение теста Coins напрямую не начисляются. Эти действия дают недельный XP и помогают выполнить цель или занять место в лиге.
            </div>

            <button
              type="button"
              onClick={() => setCoinGuideOpen(false)}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:ml-auto sm:w-auto"
            >
              Понятно
            </button>
          </section>
        </div>
      ) : null}

      <SuccessModal
        open={Boolean(redeemed)}
        title="Заявка отправлена"
        description={redeemed
          ? `Награда «${redeemed.title}» появилась в разделе «Мои заявки». Списано ${redeemed.costCoins} Coins, доступный баланс — ${redeemed.remainingCoins} Coins.`
          : ""}
        confirmLabel="Вернуться к наградам"
        onClose={() => setRedeemed(null)}
      />
    </>
  );
}
