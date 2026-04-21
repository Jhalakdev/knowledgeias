import type { APIRoute } from "astro";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifyCredentials } from "../../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const user = String(form.get("username") ?? "");
  const pass = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");

  if (!verifyCredentials(user, pass)) {
    return redirect("/admin/login?e=1&next=" + encodeURIComponent(next));
  }

  const token = signSession(user);
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: url.protocol === "https:",
  });

  return redirect(next.startsWith("/") ? next : "/admin");
};
