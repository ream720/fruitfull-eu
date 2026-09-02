export type DropStatus = "upcoming" | "active" | "sold_out" | "closed";

export interface DropItem {
  id: string;
  drop_id: string;
  sku: string;
  name: string;
  item_type: string;
  artist: string;
  image_path: string;
  secondary_image_path?: string | null;
  description: string;
  amount_minor: number;
  stock_total: number;
  stock_available: number;
  max_per_order: number;
  active: boolean;
}

export interface PublicDrop {
  id: string;
  slug: string;
  title: string;
  description: string;
  opens_at: string;
  closes_at: string | null;
  currency: string;
  shipping_amount_minor: number;
  payment_methods: string[];
  active: boolean;
  drop_items: DropItem[];
}

export const getDropStatus = (drop: PublicDrop, now = new Date()): DropStatus => {
  const opensAt = new Date(drop.opens_at);
  const closesAt = drop.closes_at ? new Date(drop.closes_at) : null;
  if (now < opensAt) return "upcoming";
  if (closesAt && now >= closesAt) return "closed";
  if (!drop.drop_items.some((item) => item.active && item.stock_available > 0)) return "sold_out";
  return "active";
};

export const formatMoney = (amountMinor: number, currency: string, locale = "en-GB") =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);

export const statusLabel: Record<DropStatus, string> = {
  upcoming: "Upcoming",
  active: "Reservations open",
  sold_out: "Sold out",
  closed: "Closed",
};
