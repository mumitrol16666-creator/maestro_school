"use client";

import {
  CheckCircle2,
  Minus,
  PackageCheck,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useDialogBehavior } from "@/hooks/use-dialog-behavior";
import { useApiResource } from "@/hooks/use-api-resource";
import { shopApi } from "@/lib/shop-api";
import type { ShopOrderStatus, ShopProduct } from "@/types/shop";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

const orderStatus: Record<ShopOrderStatus, { label: string; className: string }> = {
  awaiting_coins: { label: "Подтверждаем Coins", className: "bg-amber-50 text-amber-800" },
  new: { label: "Готовится к выдаче", className: "bg-blue-50 text-blue-800" },
  completed: { label: "Выдан", className: "bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Отменён", className: "bg-stone-100 text-stone-600" },
};

type Cart = Record<string, number>;

export function CommercialShop({ onCoinsChanged }: { onCoinsChanged?: () => Promise<unknown> }) {
  const resource = useApiResource(() => shopApi.overview(), []);
  const { refreshUser } = useAuth();
  const [cart, setCart] = useState<Cart>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [coinsToUse, setCoinsToUse] = useState(0);
  const [note, setNote] = useState("");
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkoutRef = useDialogBehavior(
    checkoutOpen,
    () => setCheckoutOpen(false),
    { canClose: !submitting },
  );

  const products = resource.data?.products ?? [];
  const cartLines = useMemo(() => products
    .map((product) => ({ product, quantity: cart[product.id] ?? 0 }))
    .filter((line) => line.quantity > 0), [cart, products]);
  const subtotal = cartLines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0);
  const cartCoinLimit = cartLines.reduce(
    (sum, line) => sum + line.product.maxCoinsPerUnit * line.quantity,
    0,
  );
  const availableCoinLimit = Math.min(resource.data?.coins ?? 0, cartCoinLimit);
  const safeCoins = Math.min(coinsToUse, availableCoinLimit);
  const cashAmount = Math.max(0, subtotal - safeCoins);

  function setQuantity(product: ShopProduct, quantity: number) {
    const next = Math.max(0, Math.min(product.stockQuantity, quantity));
    setCart((current) => {
      if (next === 0) {
        const updated = { ...current };
        delete updated[product.id];
        return updated;
      }
      return { ...current, [product.id]: next };
    });
  }

  function openCheckout() {
    setError(null);
    setCoinsToUse(Math.min(resource.data?.coins ?? 0, cartCoinLimit));
    setCheckoutKey(crypto.randomUUID());
    setCheckoutOpen(true);
  }

  async function submitOrder() {
    if (!checkoutKey || !cartLines.length) return;
    setSubmitting(true);
    setError(null);
    try {
      await shopApi.createOrder({
        externalKey: checkoutKey,
        items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        coinsToUse: safeCoins,
        notes: note.trim() || null,
      });
      setCart({});
      setCoinsToUse(0);
      setNote("");
      setCheckoutKey(null);
      setCheckoutOpen(false);
      await Promise.all([resource.reload(), refreshUser(), onCoinsChanged?.()]);
    } catch (reason) {
      if (reason && typeof reason === "object" && "code" in reason && reason.code === "INSUFFICIENT_COINS") {
        setCheckoutKey(crypto.randomUUID());
      }
      setError(reason instanceof Error ? reason.message : "Не удалось оформить заказ");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder(orderId: string) {
    setCancellingId(orderId);
    setError(null);
    try {
      await shopApi.cancelOrder(orderId);
      await Promise.all([resource.reload(), refreshUser(), onCoinsChanged?.()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отменить заказ");
    } finally {
      setCancellingId(null);
    }
  }

  if (resource.loading) return <LoadingState label="Открываем товары магазина" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  return (
    <section aria-labelledby="commercial-shop-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Товары Maestro</p>
          <h2 id="commercial-shop-title" className="font-display mt-2 text-3xl">Инструменты и аксессуары</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            У каждого товара свой лимит Coins. Остаток оплачивается при получении в школе.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          <ShoppingBag size={17} /> {money.format(resource.data.coins)} Coins
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {products.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const quantity = cart[product.id] ?? 0;
            return (
              <article key={product.id} className="flex min-h-[390px] flex-col overflow-hidden rounded-lg border border-stone-200 bg-paper shadow-soft">
                <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-4" />
                  ) : (
                    <div className="grid h-full place-items-center text-stone-300"><ShoppingBag size={44} /></div>
                  )}
                  {product.coinPaymentPercent > 0 ? (
                    <span className="absolute left-3 top-3 rounded-full bg-ink px-3 py-1.5 text-xs font-black text-white">
                      До {product.coinPaymentPercent}% Coins
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">{product.category}</p>
                  <h3 className="mt-2 text-lg font-black text-ink">{product.name}</h3>
                  {product.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-500">{product.description}</p> : null}
                  <div className="mt-auto pt-5">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-black">{money.format(product.salePrice)} ₸</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {product.coinPaymentPercent > 0
                            ? `до ${money.format(product.maxCoinsPerUnit)} Coins за ${product.unit}`
                            : "Оплата в тенге"}
                        </p>
                      </div>
                      <span className={`text-xs font-bold ${product.available ? "text-emerald-700" : "text-stone-400"}`}>
                        {product.available ? `В наличии: ${product.stockQuantity}` : "Нет в наличии"}
                      </span>
                    </div>
                    {quantity === 0 ? (
                      <button
                        type="button"
                        disabled={!product.available}
                        onClick={() => setQuantity(product, 1)}
                        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
                      >
                        <ShoppingCart size={17} /> В корзину
                      </button>
                    ) : (
                      <div className="mt-4 grid grid-cols-[48px_1fr_48px] items-center rounded-lg border border-stone-200 bg-white">
                        <button type="button" onClick={() => setQuantity(product, quantity - 1)} className="grid h-12 place-items-center" aria-label="Уменьшить количество"><Minus size={17} /></button>
                        <span className="text-center text-sm font-black">{quantity} {product.unit}</span>
                        <button type="button" onClick={() => setQuantity(product, quantity + 1)} className="grid h-12 place-items-center disabled:text-stone-300" disabled={quantity >= product.stockQuantity} aria-label="Увеличить количество"><Plus size={17} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6"><EmptyState title="Товары скоро появятся" description="Сейчас в приложении нет опубликованных товаров." /></div>
      )}

      {cartLines.length ? (
        <div className="sticky bottom-20 z-20 mt-6 flex flex-col gap-4 rounded-lg border border-amber-300 bg-ink p-4 text-white shadow-2xl sm:bottom-5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-bold text-white/55">В корзине: {cartLines.reduce((sum, line) => sum + line.quantity, 0)}</p>
            <p className="mt-1 text-xl font-black">{money.format(subtotal)} ₸</p>
          </div>
          <button type="button" onClick={openCheckout} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-gold px-6 text-sm font-black text-ink">
            Оформить заказ <ShoppingCart size={17} />
          </button>
        </div>
      ) : null}

      {resource.data.orders.length ? (
        <div className="mt-10 border-t border-stone-200 pt-8">
          <h3 className="font-display text-2xl">Мои заказы</h3>
          <div className="mt-4 space-y-3">
            {resource.data.orders.map((order) => {
              const status = orderStatus[order.status];
              const cancellable = order.status === "new" || order.status === "awaiting_coins";
              const refundPending = order.status === "cancelled" && order.coinsSpent > 0 && !order.coinsRefunded;
              return (
                <article key={order.id} className="rounded-lg border border-stone-200 bg-paper p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black">Заказ {order.number}</p>
                      <p className="mt-1 text-xs text-stone-500">{new Date(order.createdAt).toLocaleString("ru-RU")}</p>
                    </div>
                    <span className={`self-start rounded-full px-3 py-1.5 text-xs font-bold ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="mt-3 text-sm text-stone-600">{order.items.map((item) => `${item.productName} × ${item.quantity}`).join(", ")}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    {order.coinsSpent > 0 ? <span><strong>{money.format(order.coinsSpent)}</strong> Coins</span> : null}
                    <span><strong>{money.format(order.cashAmount)}</strong> ₸ при получении</span>
                    {cancellable || refundPending ? (
                      <button
                        type="button"
                        onClick={() => void cancelOrder(order.id)}
                        disabled={cancellingId === order.id}
                        className="ml-auto inline-flex items-center gap-2 font-bold text-red-700 disabled:opacity-50"
                      >
                        <Trash2 size={15} /> {cancellingId === order.id
                          ? (refundPending ? "Возвращаем..." : "Отменяем...")
                          : (refundPending ? "Вернуть Coins" : "Отменить")}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {checkoutOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-end bg-black/55 p-0 sm:place-items-center sm:p-6" role="presentation">
          <section ref={checkoutRef} role="dialog" aria-modal="true" aria-labelledby="shop-checkout-title" tabIndex={-1} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-2xl sm:max-w-xl sm:rounded-lg sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">Оформление</p>
                <h3 id="shop-checkout-title" className="font-display mt-2 text-3xl">Проверить заказ</h3>
              </div>
              <button type="button" onClick={() => setCheckoutOpen(false)} disabled={submitting} className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200" aria-label="Закрыть"><X size={18} /></button>
            </div>

            <div className="mt-6 space-y-3 border-y border-stone-200 py-5">
              {cartLines.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between gap-4 text-sm">
                  <span>{product.name} × {quantity}</span>
                  <strong className="shrink-0">{money.format(product.salePrice * quantity)} ₸</strong>
                </div>
              ))}
            </div>

            <label className="mt-6 block text-sm font-bold">
              Использовать Coins
              <div className="mt-2 grid grid-cols-[1fr_120px] gap-3">
                <input
                  type="range"
                  min={0}
                  max={availableCoinLimit}
                  step={1}
                  value={safeCoins}
                  onChange={(event) => setCoinsToUse(Number(event.target.value))}
                  className="w-full accent-amber-500"
                />
                <input
                  type="number"
                  min={0}
                  max={availableCoinLimit}
                  value={safeCoins}
                  onChange={(event) => setCoinsToUse(Math.max(0, Math.min(availableCoinLimit, Number(event.target.value) || 0)))}
                  className="h-12 rounded-lg border border-stone-300 bg-white px-3 text-right font-black outline-none focus:border-gold"
                />
              </div>
              <span className="mt-2 block text-xs font-normal text-stone-500">
                Доступно по этому заказу: {money.format(availableCoinLimit)} Coins
              </span>
            </label>

            <label className="mt-5 block text-sm font-bold">
              Комментарий к заказу
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Например, нужный цвет" className="mt-2 w-full resize-none rounded-lg border border-stone-300 bg-white p-3 text-sm outline-none focus:border-gold" />
            </label>

            <div className="mt-6 rounded-lg bg-stone-100 p-4">
              <div className="flex justify-between text-sm"><span>Coins</span><strong>{money.format(safeCoins)}</strong></div>
              <div className="mt-2 flex justify-between text-lg"><span>К оплате при получении</span><strong>{money.format(cashAmount)} ₸</strong></div>
            </div>
            <p className="mt-3 flex gap-2 text-xs leading-5 text-stone-500"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> Мы проверим наличие и подготовим заказ к выдаче в школе.</p>

            {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
            <button type="button" onClick={() => void submitOrder()} disabled={submitting} className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-4 text-sm font-black text-white disabled:opacity-60">
              <PackageCheck size={18} /> {submitting ? "Оформляем..." : "Подтвердить заказ"}
            </button>
          </section>
        </div>
      ) : null}
    </section>
  );
}
