import type { APIRoute } from "astro";
import { requestAdminMagicLink } from "../../../lib/admin-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 422 });
  }
  try {
    await requestAdminMagicLink(email, cookies);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Sign-in email is temporarily unavailable." }, { status: 503 });
  }
};
