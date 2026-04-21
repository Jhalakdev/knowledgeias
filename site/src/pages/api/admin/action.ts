import type { APIRoute } from "astro";
import { deleteSubmission, markAllRead, markRead } from "../../../lib/store";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const id = String(form.get("id") ?? "");

  if (action === "delete" && id) deleteSubmission(id);
  else if (action === "mark-read" && id) markRead(id);
  else if (action === "mark-all-read") markAllRead();

  return redirect("/admin");
};
