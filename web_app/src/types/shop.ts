export type ShopCoinPaymentPercent = 0 | 50 | 100;
export type ShopOrderStatus = "awaiting_coins" | "new" | "completed" | "cancelled";

export interface ShopProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  description: string | null;
  imageUrl: string | null;
  salePrice: number;
  stockQuantity: number;
  coinPaymentPercent: ShopCoinPaymentPercent;
  maxCoinsPerUnit: number;
  available: boolean;
  updatedAt: string;
}

export interface ShopOrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  coinPaymentPercent: ShopCoinPaymentPercent;
  maxCoins: number;
}

export interface ShopOrder {
  id: string;
  number: string;
  externalKey: string;
  status: ShopOrderStatus;
  subtotal: number;
  discountAmount: number;
  coinsSpent: number;
  coinsRefunded: boolean;
  cashAmount: number;
  notes: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: ShopOrderItem[];
}

export interface StudentShopOverview {
  products: ShopProduct[];
  orders: ShopOrder[];
  coins: number;
}
