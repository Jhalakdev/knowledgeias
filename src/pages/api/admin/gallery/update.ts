import type { APIRoute } from "astro";
import { updateGalleryCaption } from "../../../../lib/gallery";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const caption = String(form.get("caption") ?? "");

  if (!id) {
    return redirect("/admin?tab=gallery");
  }

  try {
    await updateGalleryCaption(id, caption);
  } catch (e) {
    console.error("[admin/gallery/update] failed", e);
  }

  return redirect("/admin?tab=gallery");
};
