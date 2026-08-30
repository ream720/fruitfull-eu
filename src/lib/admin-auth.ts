import type { AstroCookies } from "astro";
import { getSupabaseAuthConfig } from "./supabase-rest";

const ACCESS_COOKIE = "ff_admin_access";
const REFRESH_COOKIE = "ff_admin_refresh";
const VERIFIER_COOKIE = "ff_admin_pkce";

type SupabaseUser = { id: string; email?: string };
export type AdminSession = { userId: string; email: string; accessToken: string };

const cookieOptions = () => ({
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: "lax" as const,
  path: "/",
});

const authHeaders = () => {
  const { publishableKey } = getSupabaseAuthConfig();
  if (!publishableKey) throw new Error("supabase_auth_not_configured");
  return { apikey: publishableKey, "Content-Type": "application/json" };
};

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const randomVerifier = () => {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

const sha256Challenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
};

export const getAdminEmails = () =>
  String(import.meta.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email: string) => getAdminEmails().includes(email.trim().toLowerCase());

const saveTokens = (cookies: AstroCookies, payload: { access_token: string; refresh_token: string; expires_in?: number }) => {
  cookies.set(ACCESS_COOKIE, payload.access_token, { ...cookieOptions(), maxAge: payload.expires_in || 3600 });
  cookies.set(REFRESH_COOKIE, payload.refresh_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 30 });
};

export const clearAdminSession = (cookies: AstroCookies) => {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, VERIFIER_COOKIE]) cookies.delete(name, { path: "/" });
};

export const requestAdminMagicLink = async (email: string, cookies: AstroCookies, origin: string) => {
  const normalized = email.trim().toLowerCase();
  if (!isAdminEmail(normalized)) return;

  const { url } = getSupabaseAuthConfig();
  if (!url) throw new Error("supabase_auth_not_configured");
  const verifier = randomVerifier();
  const challenge = await sha256Challenge(verifier);
  const redirectTo = `${origin}/auth/callback`;
  const response = await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: normalized,
      create_user: false,
      code_challenge: challenge,
      code_challenge_method: "s256",
    }),
  });
  if (!response.ok) throw new Error(`magic_link_${response.status}`);
  cookies.set(VERIFIER_COOKIE, verifier, { ...cookieOptions(), maxAge: 600 });
};

export const exchangeAdminCode = async (code: string, cookies: AstroCookies) => {
  const verifier = cookies.get(VERIFIER_COOKIE)?.value;
  const { url } = getSupabaseAuthConfig();
  if (!url || !verifier) throw new Error("invalid_auth_callback");
  const response = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token || !payload?.refresh_token) throw new Error("invalid_auth_callback");
  saveTokens(cookies, payload);
  cookies.delete(VERIFIER_COOKIE, { path: "/" });
};

const fetchUser = async (accessToken: string): Promise<SupabaseUser | null> => {
  const { url } = getSupabaseAuthConfig();
  if (!url) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { ...authHeaders(), Authorization: `Bearer ${accessToken}` },
  });
  return response.ok ? response.json() : null;
};

export const getAdminSession = async (cookies: AstroCookies): Promise<AdminSession | null> => {
  let accessToken = cookies.get(ACCESS_COOKIE)?.value || "";
  let user = accessToken ? await fetchUser(accessToken) : null;

  if (!user) {
    const refreshToken = cookies.get(REFRESH_COOKIE)?.value;
    const { url } = getSupabaseAuthConfig();
    if (!refreshToken || !url) return null;
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
      clearAdminSession(cookies);
      return null;
    }
    accessToken = payload.access_token;
    saveTokens(cookies, payload);
    user = await fetchUser(accessToken);
  }

  const email = user?.email?.toLowerCase() || "";
  if (!user || !email || !isAdminEmail(email)) {
    clearAdminSession(cookies);
    return null;
  }
  return { userId: user.id, email, accessToken };
};
