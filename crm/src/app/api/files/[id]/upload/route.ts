import { NotFoundError, PermissionError, RuleError } from "@/lib/errors";
import { MAX_FILE_BYTES, receiveUpload } from "@/lib/files";
import { getActor } from "@/lib/session";
import { fileStore } from "@/lib/storage";

// Receives a file's bytes when files are kept in a local folder (development). With Supabase the
// browser sends them straight to storage instead.
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in first." }, { status: 401 });
  const store = fileStore();
  if (store.kind !== "local") return Response.json({ error: "Files go straight to storage." }, { status: 400 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_FILE_BYTES) return Response.json({ error: "That file is too big." }, { status: 413 });
  const { id } = await ctx.params;
  try {
    await receiveUpload(actor, id, new Uint8Array(await request.arrayBuffer()), store);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "That upload doesn't exist." }, { status: 404 });
    if (e instanceof PermissionError) return Response.json({ error: e.message }, { status: 403 });
    if (e instanceof RuleError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
