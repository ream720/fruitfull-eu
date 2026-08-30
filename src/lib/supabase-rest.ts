import type { PublicDrop } from "./drops";

const getConfig = () => ({
  url: import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL ||
    import.meta.env.SUPABASE_SUPABASE_URL || import.meta.env.SUPABASE_PUBLIC_SUPABASE_URL || "",
  secret: import.meta.env.SUPABASE_SECRET_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
    import.meta.env.SUPABASE_SUPABASE_SECRET_KEY || import.meta.env.SUPABASE_SUPABASE_SERVICE_ROLE_KEY || "",
  publishableKey: import.meta.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.SUPABASE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.SUPABASE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.SUPABASE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_PUBLIC_SUPABASE_ANON_KEY || "",
});

export const isSupabaseConfigured = () => {
  const config = getConfig();
  return Boolean(config.url && config.secret);
};

export const supabaseAdminFetch = async (path: string, init: RequestInit = {}) => {
  const { url, secret } = getConfig();
  if (!url || !secret) throw new Error("supabase_not_configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", secret);
  if (!secret.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${secret}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${url}${path}`, { ...init, headers });
};

export const callRpc = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const response = await supabaseAdminFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.hint || `rpc_${response.status}`);
    Object.assign(error, { status: response.status, code: payload?.code });
    throw error;
  }
  return payload as T;
};

export const getPublicDrops = async (): Promise<PublicDrop[]> => {
  if (!isSupabaseConfigured()) return [];
  const query = new URLSearchParams({
    select: "id,slug,title,description,opens_at,closes_at,currency,shipping_amount_minor,payment_methods,active,drop_items(id,drop_id,sku,name,item_type,artist,image_path,description,amount_minor,stock_total,stock_available,max_per_order,active)",
    active: "eq.true",
    order: "opens_at.asc",
    "drop_items.order": "name.asc",
  });
  const response = await supabaseAdminFetch(`/rest/v1/drops?${query}`);
  if (!response.ok) throw new Error(`drops_fetch_${response.status}`);
  return response.json();
};

export const getReservationRetry = async (idempotencyKey: string, email: string, phone: string) => {
  if (!isSupabaseConfigured()) return null;
  const query = new URLSearchParams({
    select: "reference,status,expires_at,currency,subtotal_minor,shipping_minor,total_minor,drops(payment_instructions)",
    idempotency_key: `eq.${idempotencyKey}`,
    customer_email: `eq.${email}`,
    customer_phone: `eq.${phone}`,
    limit: "1",
  });
  const response = await supabaseAdminFetch(`/rest/v1/orders?${query}`);
  if (!response.ok) throw new Error(`reservation_retry_${response.status}`);
  const [order] = await response.json();
  if (!order) return null;
  return {
    reference: order.reference,
    status: order.status,
    expiresAt: order.expires_at,
    currency: order.currency,
    subtotalMinor: order.subtotal_minor,
    shippingMinor: order.shipping_minor,
    totalMinor: order.total_minor,
    paymentInstructions: order.drops?.payment_instructions,
  };
};

export const getSupabaseAuthConfig = () => {
  const { url, publishableKey } = getConfig();
  return { url, publishableKey };
};
