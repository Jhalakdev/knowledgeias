import type { APIRoute } from "astro";
import { deleteGalleryImage } from "../../../../lib/gallery";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const ct = request.headers.get("content-type") || "";
  let id = "";

  if (ct.includes("application/json")) {
    try {
      const body = await request.json();
      id = String(body?.id ?? "");
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
  } else {
    const form = await request.formData();
    id = String(form.get("id") ?? "");
  }

  if (!id) {
    if (ct.includes("application/json")) {
      return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
    }
    return redirect("/admin?tab=gallery");
  }

  try {
    const ok = await deleteGalleryImage(id);
    if (ct.includes("application/json")) {
      return Response.json({ ok });
    }
    return redirect("/admin?tab=gallery");
  } catch (e) {
    console.error("[admin/gallery/delete] failed", e);
    if (ct.includes("application/json")) {
      return Response.json({ ok: false, error: "Delete failed" }, { status: 500 });
    }
    return redirect("/admin?tab=gallery");
  }
};
