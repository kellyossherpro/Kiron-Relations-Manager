import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { joinTeam, makeUser, resetDb } from "@/test/helpers";
import { NotFoundError, PermissionError, RuleError } from "./errors";
import { clearUnfinishedUploads, deleteFile, finishUpload, listFiles, openFile, receiveUpload, startUpload } from "./files";
import type { Actor } from "./permissions";
import { listHistory } from "./queries";
import { createRecord } from "./records";
import { localStore, supabaseStore, type FileStore } from "./storage";

let store: FileStore;
beforeEach(async () => {
  await resetDb();
  store = localStore(await mkdtemp(path.join(os.tmpdir(), "krm-files-")));
});
afterAll(() => pool.end());

const PDF = new TextEncoder().encode("%PDF-1.4 example proposal");

async function upload(actor: Actor, dealId: string, input: Partial<Parameters<typeof startUpload>[1]> = {}) {
  const { fileId, target } = await startUpload(actor, { objectType: "deal", objectId: dealId, name: "Proposal v1.pdf", size: PDF.byteLength, category: "proposal", ...input }, store);
  expect(target.url).toBe(`/api/files/${fileId}/upload`);
  await receiveUpload(actor, fileId, PDF, store);
  await finishUpload(actor, fileId, store);
  return fileId;
}

describe("files on a deal", () => {
  it("a proposal is only opened by people who see fees and rates, and every open is logged", async () => {
    const sales = await makeUser("sales");
    const support = await joinTeam(await makeUser("viewer"), "Support & Installations");
    const finance = await joinTeam(await makeUser("viewer"), "Finance", { seesCommercials: true });
    const deal = await createRecord(sales, "deal", { name: "Example deal" });
    await expect(upload(support, deal)).rejects.toThrow(PermissionError); // read-only people can't add files
    const id = await upload(sales, deal);

    expect((await listFiles(support, "deal", deal))).toEqual({ files: [], hidden: 1 });
    await expect(openFile(support, id)).rejects.toThrow(PermissionError);
    expect(await openFile(finance, id)).toMatchObject({ name: "Proposal v1.pdf", contentType: "application/pdf", inline: true });
    await openFile(sales, id);

    const mine = (await listFiles(sales, "deal", deal)).files[0];
    expect(mine).toMatchObject({ category: "proposal", accessLabel: "People who see fees and rates", opens: 2, canDelete: true });
    expect(mine.openedBy!.map((o) => o.by)).toEqual([sales.name, finance.name]);
    expect((await listFiles(finance, "deal", deal)).files[0]).toMatchObject({ canDelete: false, openedBy: null }); // the log is for the uploader and admins
    expect(Buffer.from(await store.read!(`deal/${deal}/${id}`)).toString()).toBe("%PDF-1.4 example proposal");
    expect((await listHistory("deal", deal)).find((h) => h.action === "file")?.newValue).toEqual({ category: "proposal", added: true });
  });

  it("can be limited to chosen departments; Legal adds contracts to any deal", async () => {
    const sales = await makeUser("sales");
    const legal = await joinTeam(await makeUser("legal"), "Risk, Legal, & Compliance");
    const manager = await makeUser("manager");
    const deal = await createRecord(sales, "deal", { name: "Example deal" });
    const id = await upload(legal, deal, { name: "Signed agreement.docx", category: "contract", access: "teams", teamIds: legal.teamIds });
    await expect(openFile(manager, id)).rejects.toThrow(PermissionError); // not in Legal
    await expect(openFile(sales, id)).rejects.toThrow(PermissionError);
    expect((await openFile(legal, id)).inline).toBe(false); // Word files download
    expect((await listFiles(legal, "deal", deal)).files[0].accessLabel).toBe("Only Risk, Legal, & Compliance");
    await expect(upload(legal, deal, { access: "teams", teamIds: [] })).rejects.toThrow("at least one department");
  });

  it("refuses the wrong kind of file, a file that's too big, and one that didn't fully arrive", async () => {
    const sales = await makeUser("sales");
    const deal = await createRecord(sales, "deal", { name: "Example deal" });
    await expect(upload(sales, deal, { name: "run-me.exe" })).rejects.toThrow("can't be added");
    await expect(upload(sales, deal, { size: 51 * 1024 * 1024 })).rejects.toThrow("up to 50 MB");
    const { fileId } = await startUpload(sales, { objectType: "deal", objectId: deal, name: "../../etc/passwd.pdf", size: 999, category: "other" }, store);
    await expect(receiveUpload(sales, fileId, PDF, store)).rejects.toThrow(RuleError);
    await expect(finishUpload(sales, fileId, store)).rejects.toThrow("didn't arrive");
    expect((await db.execute(sql`select name from files where id = ${fileId}`)).rows[0].name).toBe("passwd.pdf");
    // Unfinished uploads are cleared after a day.
    expect(await clearUnfinishedUploads(new Date(Date.now() + 2 * 86_400_000), store)).toBe(1);
  });

  it("removing: only the uploader or an admin; it's gone from the list and can't be opened", async () => {
    const sales = await makeUser("sales");
    const other = await makeUser("sales");
    const admin = await makeUser("admin");
    const deal = await createRecord(sales, "deal", { name: "Example deal" });
    const id = await upload(sales, deal, { category: "rice_report", name: "RICE.pdf" });
    expect((await listFiles(other, "deal", deal)).files).toHaveLength(1); // RICE reports: everyone
    await expect(deleteFile(other, id)).rejects.toThrow(PermissionError);
    await deleteFile(admin, id);
    expect(await listFiles(sales, "deal", deal)).toEqual({ files: [], hidden: 0 });
    await expect(openFile(sales, id)).rejects.toThrow(NotFoundError);
  });
});

describe("Supabase storage", () => {
  it("asks for one-time upload links and one-minute download links, with the service key", async () => {
    const calls: { url: string; method?: string; headers: Record<string, string> }[] = [];
    const fake = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method, headers: init.headers as Record<string, string> });
      if (url.includes("/object/upload/sign/")) return Response.json({ url: "/object/upload/sign/krm-files/deal/a/b?token=t1" });
      if (url.includes("/object/sign/")) return Response.json({ signedURL: "/object/sign/krm-files/deal/a/b?token=t2" });
      return new Response(null, { status: 200, headers: { "content-length": "25" } });
    }) as typeof fetch;
    const s = supabaseStore({ SUPABASE_URL: "https://proj.example.test/", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fake);
    expect(await s.uploadTarget("deal/a/b", "b", "application/pdf")).toEqual({
      url: "https://proj.example.test/storage/v1/object/upload/sign/krm-files/deal/a/b?token=t1",
      headers: { "content-type": "application/pdf", "x-upsert": "false" },
    });
    expect(await s.size("deal/a/b")).toBe(25);
    expect(await s.signedUrl!("deal/a/b", "Proposal v1.pdf")).toBe("https://proj.example.test/storage/v1/object/sign/krm-files/deal/a/b?token=t2&download=Proposal+v1.pdf");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://proj.example.test/storage/v1/object/upload/sign/krm-files/deal/a/b",
      "HEAD https://proj.example.test/storage/v1/object/krm-files/deal/a/b",
      "POST https://proj.example.test/storage/v1/object/sign/krm-files/deal/a/b",
    ]);
    expect(calls.every((c) => c.headers.authorization === "Bearer secret")).toBe(true);
    expect(() => supabaseStore({}, fake)).toThrow("isn't set up");
  });
});
