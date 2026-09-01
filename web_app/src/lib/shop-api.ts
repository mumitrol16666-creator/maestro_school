import { apiRequest } from "./api-client";
import type { ShopOrder, StudentShopOverview } from "@/types/shop";

export const shopApi = {
  overview: () => apiRequest<StudentShopOverview>("/students/me/shop"),
  createOrder: (body: {
    externalKey: string;
    items: Array<{ productId: string; quantity: number }>;
    coinsToUse: number;
    notes?: string | null;
  }) => apiRequest<{ order: ShopOrder; coins: number }>("/students/me/shop/orders", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  cancelOrder: (orderId: string) =>
    apiRequest<{ order: ShopOrder; coins: number }>(
      `/students/me/shop/orders/${encodeURIComponent(orderId)}/cancel`,
      { method: "POST" },
    ),
};
