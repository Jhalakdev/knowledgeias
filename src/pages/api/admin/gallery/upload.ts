import type { APIRoute } from "astro";
import { addGalleryImage, isAllowedImageType } from "../../../../lib/gallery";

export const prerender = false;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "No file uploaded" }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return Response.json({ ok: false, error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: `File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ ok: false, error: "Empty file" }, { status: 400 });
  }

  const caption = String(form.get("caption") ?? "");
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const image = await addGalleryImage({
      buffer,
      filename: file.name || "image",
      type: file.type,
      caption,
    });
    return Response.json({ ok: true, image });
  } catch (e) {
    console.error("[admin/gallery/upload] failed", e);
    return Response.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
};
