import type { APIRoute } from "astro";
import { addSubscriber } from "../../lib/store";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let email = "";
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const data = (await request.json()) as { email?: unknown };
      email = typeof data.email === "string" ? data.email.trim() : "";
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "").trim();
    }
  } catch {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }

  if (!email || !email.includes("@") || email.length > 200) {
    return json({ ok: false, error: "Please enter a valid email" }, 400);
  }

  try {
    const { alreadyExists } = await addSubscriber(email, clientAddress);
    return json({ ok: true, alreadyExists });
  } catch (e) {
    console.error("[api/newsletter] store error", e);
    return json({ ok: false, error: "Storage error" }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
