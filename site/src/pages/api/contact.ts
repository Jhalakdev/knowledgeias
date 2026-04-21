import type { APIRoute } from "astro";
import { addSubmission } from "../../lib/store";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let data: Record<string, unknown>;
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      data = (await request.json()) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      data = Object.fromEntries(form.entries()) as Record<string, unknown>;
    }
  } catch {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  // honeypot
  if (data.company) return json({ ok: true });

  const name = str(data.name);
  const email = str(data.email);
  const phone = str(data.phone);
  const role = str(data.role);
  const programme = str(data.programme);
  const message = str(data.message);

  if (!name || !email || !phone) {
    return json({ ok: false, error: "Missing required fields: name, email, phone" }, 400);
  }
  if (!email.includes("@") || email.length > 200) {
    return json({ ok: false, error: "Invalid email" }, 400);
  }

  const ip = clientAddress ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  const saved = addSubmission({
    name: name.slice(0, 200),
    email: email.slice(0, 200),
    phone: phone.slice(0, 50),
    role: role ? role.slice(0, 100) : undefined,
    programme: programme ? programme.slice(0, 100) : undefined,
    message: message ? message.slice(0, 4000) : undefined,
    ip,
    userAgent,
  });

  return json({ ok: true, id: saved.id });
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
