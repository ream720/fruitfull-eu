import type { APIRoute } from "astro";
import { getAdminSession } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase-rest";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getAdminSession(cookies);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 25;
  const allowedStatuses = new Set(["awaiting_payment", "paid", "awaiting_shipment", "shipped", "cancelled", "expired"]);
  const requestedStatus = url.searchParams.get("status") || "";
  const status = allowedStatuses.has(requestedStatus) ? requestedStatus : "";
  const search = (url.searchParams.get("search") || "").trim().slice(0, 120).replace(/[^\p{L}\p{N}@._+\-\s]/gu, "");
  const sort = url.searchParams.get("sort") === "oldest" ? "created_at.asc" : "created_at.desc";
  const query = new URLSearchParams({
    select: "*,order_items(*),order_events(*),notification_outbox(id,template_key,attempts,sent_at,last_error,created_at)",
    order: sort,
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
  });
  if (status) query.set("status", `eq.${status}`);
  if (search) query.set("or", `(reference.ilike.*${search}*,customer_name.ilike.*${search}*,customer_email.ilike.*${search}*)`);

  const response = await supabaseAdminFetch(`/rest/v1/orders?${query}`, {
    headers: { Prefer: "count=exact", "Cache-Control": "no-store" },
  });
  if (!response.ok) return Response.json({ error: "orders_unavailable" }, { status: 503 });
  const range = response.headers.get("content-range") || "*/0";
  const total = Number.parseInt(range.split("/")[1] || "0", 10) || 0;
  return Response.json({ orders: await response.json(), page, pageSize, total }, {
    headers: { "Cache-Control": "no-store" },
  });
};
