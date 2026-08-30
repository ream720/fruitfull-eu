import type { APIRoute } from "astro";
import { clearAdminSession } from "../../../lib/admin-auth";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  clearAdminSession(cookies);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
};
