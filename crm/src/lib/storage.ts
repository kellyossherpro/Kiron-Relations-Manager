import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { RuleError } from "./errors";

// Where uploaded files' bytes live. Never public: every download goes through KRM, which checks
// who's asking and logs it (src/app/files/[id]/route.ts).
//
// FILE_STORAGE=supabase  a private Supabase Storage bucket (the online version). Needs SUPABASE_URL,
//                        SUPABASE_SERVICE_ROLE_KEY and optionally SUPABASE_BUCKET (default krm-files).
//                        Browsers upload straight to it with a one-time link, so big files don't pass
//                        through the app, and download with a link that works for one minute.
// FILE_STORAGE=local     a folder on this computer (FILE_STORAGE_DIR, default .krm-files). The default
//                        outside production; on a host like Vercel the folder doesn't survive.

export type UploadTarget = { url: string; headers: Record<string, string> };

export interface FileStore {
  kind: "local" | "supabase";
  // Where the browser sends the file (PUT). For local storage that's KRM's own upload route.
  uploadTarget(key: string, fileId: string, contentType: string): Promise<UploadTarget>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  size(key: string): Promise<number | null>; // null: nothing there
  remove(key: string): Promise<void>;
  // Supabase: a short-lived link to the bytes. Local: the bytes themselves.
  signedUrl?(key: string, downloadName: string | null): Promise<string>;
  read?(key: string): Promise<Uint8Array>;
}

export function fileStore(): FileStore {
  const mode = process.env.FILE_STORAGE ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (mode === "supabase") return supabaseStore();
  if (mode === "local") return localStore(process.env.FILE_STORAGE_DIR ?? path.join(process.cwd(), ".krm-files"));
  throw new RuleError("File storage isn't set up yet. Ask your admin (FILE_STORAGE in the hosting settings).");
}

// ---------- local folder ----------

export function localStore(dir: string): FileStore {
  // Keys are made by KRM ("deal/<uuid>/<uuid>"), but never let one point outside the folder.
  const where = (key: string) => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error("Bad storage key");
    return p;
  };
  return {
    kind: "local",
    async uploadTarget(_key, fileId, contentType) {
      return { url: `/api/files/${fileId}/upload`, headers: { "content-type": contentType } };
    },
    async put(key, bytes) {
      const p = where(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, bytes);
    },
    async size(key) {
      try {
        return (await stat(where(key))).size;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(where(key), { force: true });
    },
    async read(key) {
      return new Uint8Array(await readFile(where(key)));
    },
  };
}

// ---------- Supabase Storage (private bucket) ----------

export function supabaseStore(env: Record<string, string | undefined> = process.env, doFetch: typeof fetch = fetch): FileStore {
  const base = env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_BUCKET || "krm-files";
  if (!base || !key) throw new RuleError("File storage isn't set up yet. Ask your admin (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).");
  const api = `${base}/storage/v1`;
  const auth = { authorization: `Bearer ${key}`, apikey: key };
  const objectPath = (k: string) => `${bucket}/${k.split("/").map(encodeURIComponent).join("/")}`;
  async function call(url: string, init: RequestInit) {
    const res = await doFetch(url, { ...init, headers: { ...auth, ...(init.headers as Record<string, string>) } });
    if (!res.ok) throw new Error(`File storage said ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }
  return {
    kind: "supabase",
    async uploadTarget(k, _fileId, contentType) {
      const res = await call(`${api}/object/upload/sign/${objectPath(k)}`, { method: "POST" });
      const { url } = (await res.json()) as { url: string };
      return { url: `${api}${url}`, headers: { "content-type": contentType, "x-upsert": "false" } };
    },
    async put(k, bytes, contentType) {
      await call(`${api}/object/${objectPath(k)}`, { method: "POST", body: Buffer.from(bytes), headers: { "content-type": contentType, "x-upsert": "false" } });
    },
    async size(k) {
      const res = await doFetch(`${api}/object/${objectPath(k)}`, { method: "HEAD", headers: auth });
      if (!res.ok) return null;
      return Number(res.headers.get("content-length") ?? 0);
    },
    async remove(k) {
      await call(`${api}/object/${bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: [k] }), headers: { "content-type": "application/json" } });
    },
    async signedUrl(k, downloadName) {
      const res = await call(`${api}/object/sign/${objectPath(k)}`, { method: "POST", body: JSON.stringify({ expiresIn: 60 }), headers: { "content-type": "application/json" } });
      const { signedURL } = (await res.json()) as { signedURL: string };
      const url = new URL(`${api}${signedURL}`);
      if (downloadName) url.searchParams.set("download", downloadName);
      return url.toString();
    },
  };
}
