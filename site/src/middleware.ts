import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE, verifySession } from "./lib/auth";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;

  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isAdminApi =
    pathname.startsWith("/api/admin") &&
    pathname !== "/api/admin/login" &&
    pathname !== "/api/admin/login/";

  if (isAdminPage || isAdminApi) {
    const token = ctx.cookies.get(SESSION_COOKIE)?.value;
    const session = verifySession(token);
    if (!session) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return ctx.redirect("/admin/login?next=" + encodeURIComponent(pathname));
    }
    ctx.locals.user = session.user;
  }

  return next();
});
