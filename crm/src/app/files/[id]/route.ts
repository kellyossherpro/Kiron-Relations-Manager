import { NotFoundError, PermissionError, RuleError } from "@/lib/errors";
import { openFile } from "@/lib/files";
import { getActor } from "@/lib/session";
import { fileStore } from "@/lib/storage";

// Opening a file: KRM checks who's asking and logs it, then hands over the bytes (local storage) or
// a link that works for one minute (Supabase). Files are never reachable any other way.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return Response.redirect(new URL("/sign-in", request.url), 303);
  const { id } = await ctx.params;
  try {
    const file = await openFile(actor, id);
    const store = fileStore();
    const disposition = `${file.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`;
    if (store.signedUrl) return Response.redirect(await store.signedUrl(file.storageKey, file.inline ? null : file.name), 303);
    const bytes = await store.read!(file.storageKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": disposition,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new Response("This file doesn't exist or was removed.", { status: 404 });
    if (e instanceof PermissionError) return new Response("You can't open this file.", { status: 403 });
    if (e instanceof RuleError) return new Response(e.message, { status: 503 });
    throw e;
  }
}
