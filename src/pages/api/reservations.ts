import type { APIRoute } from "astro";
import { callRpc, getReservationRetry, isSupabaseConfigured } from "../../lib/supabase-rest";
import { validateReservation } from "../../lib/reservation";

export const prerender = false;

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const verifyTurnstile = async (token: string, idempotencyKey: string) => {
  const secret = import.meta.env.TURNSTILE_SECRET_KEY || "";
  if (!secret) throw new Error("turnstile_not_configured");
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  body.set("idempotency_key", idempotencyKey);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!response.ok) throw new Error("turnstile_unavailable");
  const result = await response.json();
  return result.success === true;
};

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.json().catch(() => null);
  if (raw && typeof raw === "object" && typeof raw.website === "string" && raw.website.trim()) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = validateReservation(raw);
  if (!parsed.success) return json({ error: "validation_failed", fields: parsed.errors }, 422);
  if (!isSupabaseConfigured()) return json({ error: "reservations_unavailable" }, 503);

  try {
    const retry = await getReservationRetry(parsed.payload.idempotencyKey, parsed.payload.customer.email, parsed.payload.customer.phone);
    if (retry) return json(retry, 201);
    if (!(await verifyTurnstile(parsed.payload.turnstileToken, parsed.payload.idempotencyKey))) {
      return json({ error: "security_check_failed" }, 422);
    }
    const customer = { ...parsed.payload.customer };
    const result = await callRpc<Record<string, unknown>>("create_reservation", {
      p_drop_id: parsed.payload.dropId,
      p_items: parsed.payload.items,
      p_customer: customer,
      p_shipping: parsed.payload.shipping,
      p_idempotency_key: parsed.payload.idempotencyKey,
    });
    return json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "reservation_failed";
    if (/active_reservation_exists/.test(message)) return json({ error: "active_reservation_exists" }, 429);
    if (/insufficient_stock|item_unavailable|drop_(unavailable|not_open|closed)/.test(message)) {
      return json({ error: "availability_changed" }, 409);
    }
    if (/quantity_invalid|payment_method_invalid|items_required|duplicate_items/.test(message)) {
      return json({ error: "validation_failed" }, 422);
    }
    return json({ error: "reservations_unavailable" }, 503);
  }
};
