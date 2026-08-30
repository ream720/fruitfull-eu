import type { APIRoute } from "astro";
import { getAdminSession } from "../../../../lib/admin-auth";
import { callRpc } from "../../../../lib/supabase-rest";

export const prerender = false;

const allowedActions = new Set([
  "mark_paid", "mark_awaiting_shipment", "update_tracking", "mark_shipped",
  "cancel", "add_note", "retry_email", "anonymize",
]);

export const PATCH: APIRoute = async ({ cookies, params, request }) => {
  const session = await getAdminSession(cookies);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const version = Number(body?.version);
  if (!params.id || !allowedActions.has(action) || !Number.isInteger(version) || version < 1) {
    return Response.json({ error: "invalid_request" }, { status: 422 });
  }
  const rawPayload = body?.payload && typeof body.payload === "object" ? body.payload : {};
  const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const payload: Record<string, string> = {};
  if (action === "cancel" || action === "add_note") payload.note = clean(rawPayload.note, 2000);
  if (action === "update_tracking" || action === "mark_shipped") {
    if (action === "update_tracking" || "trackingCarrier" in rawPayload) payload.trackingCarrier = clean(rawPayload.trackingCarrier, 120);
    if (action === "update_tracking" || "trackingNumber" in rawPayload) payload.trackingNumber = clean(rawPayload.trackingNumber, 200);
    if (action === "update_tracking" || "trackingUrl" in rawPayload) payload.trackingUrl = clean(rawPayload.trackingUrl, 500);
    if (payload.trackingUrl && !/^https?:\/\/[^\s]+$/i.test(payload.trackingUrl)) {
      return Response.json({ error: "tracking_url_invalid" }, { status: 422 });
    }
  }
  try {
    const order = await callRpc("admin_update_order", {
      p_order_id: params.id,
      p_action: action,
      p_expected_version: version,
      p_actor_email: session.email,
      p_payload: payload,
    });
    return Response.json({ order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "update_failed";
    if (/version_conflict/.test(message)) return Response.json({ error: "version_conflict" }, { status: 409 });
    if (/transition_invalid|note_required|terminal_order_required|action_invalid/.test(message)) {
      return Response.json({ error: message.split(":")[0] }, { status: 422 });
    }
    if (/order_not_found/.test(message)) return Response.json({ error: "order_not_found" }, { status: 404 });
    return Response.json({ error: "update_unavailable" }, { status: 503 });
  }
};
