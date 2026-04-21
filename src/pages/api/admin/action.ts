import type { APIRoute } from "astro";
import {
  deleteSubmission,
  markAllSubmissionsRead,
  markSubmissionRead,
  deleteSubscriber,
} from "../../../lib/store";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const id = String(form.get("id") ?? "");

  try {
    if (action === "delete" && id) await deleteSubmission(id);
    else if (action === "mark-read" && id) await markSubmissionRead(id);
    else if (action === "mark-all-read") await markAllSubmissionsRead();
    else if (action === "delete-subscriber" && id) await deleteSubscriber(id);
  } catch (e) {
    console.error("[admin/action] error", e);
  }

  return redirect("/admin");
};
