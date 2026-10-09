"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteFileAction, finishUploadAction, startUploadAction } from "@/app/actions";
import { date, dateTime } from "@/lib/format";

type Category = "proposal" | "rice_report" | "contract" | "other";
type Access = "everyone" | "commercial" | "teams";
export type FileItem = {
  id: string;
  name: string;
  category: Category;
  sizeBytes: number;
  accessLabel: string;
  uploadedByName: string;
  uploadedAt: string;
  inline: boolean;
  canDelete: boolean;
  opens: number;
  lastOpened: { by: string; at: string } | null;
  openedBy: { by: string; at: string }[] | null;
};

const CATEGORY: Record<Category, string> = { proposal: "Proposal", rice_report: "RICE report", contract: "Contract", other: "Other" };
// Proposals and contracts hold fees and rates, so they start as "people who see fees and rates".
const DEFAULT_ACCESS: Record<Category, Access> = { proposal: "commercial", contract: "commercial", rice_report: "everyone", other: "everyone" };
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.zip,.msg,.eml";

function size(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 4) : "FILE");

/** Files on a deal or company: private, each opened only by the people it allows, every open logged. */
export function FilesPanel({
  objectType,
  objectId,
  files,
  hidden,
  canUpload,
  teams,
}: {
  objectType: "deal" | "company";
  objectId: string;
  files: FileItem[];
  hidden: number;
  canUpload: boolean;
  teams: { id: string; name: string }[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>("proposal");
  const [access, setAccess] = useState<Access>("commercial");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();

  function pickCategory(c: Category) {
    setCategory(c);
    setAccess(DEFAULT_ACCESS[c]);
  }

  async function upload() {
    if (!file) return;
    setMsg(null);
    setBusy(`Uploading ${file.name}…`);
    try {
      const started = await startUploadAction({ objectType, objectId, name: file.name, size: file.size, category, access, teamIds });
      if (!started.ok || !started.target) throw new Error(started.ok ? "Something went wrong." : started.error);
      const put = await fetch(started.target.url, { method: "PUT", body: file, headers: started.target.headers });
      if (!put.ok) throw new Error("The upload didn't go through. Check your connection and try again.");
      const done = await finishUploadAction(started.id!);
      if (!done.ok) throw new Error(done.error);
      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card @container p-5" aria-label="Files">
      <h2 className="h2 mb-3">Files{files.length > 0 && ` (${files.length})`}</h2>
      {files.length === 0 && !hidden && <p className="text-sm text-muted">No files yet.{canUpload && " Add the proposal, the RICE report or the contract here."}</p>}
      {files.length > 0 && (
        <ul className="divide-y divide-line">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink text-[10px] font-black tracking-wide text-white" aria-hidden>{ext(f.name)}</span>
              <div className="min-w-0 flex-1">
                <a href={`/files/${f.id}`} target={f.inline ? "_blank" : undefined} rel="noreferrer" className="font-bold break-words text-brand-dark hover:underline">{f.name}</a>
                <p className="text-xs text-muted">
                  <span className="pill mr-1 bg-paper text-ink">{CATEGORY[f.category]}</span>
                  {size(f.sizeBytes)} · added by {f.uploadedByName} on {date(f.uploadedAt)}
                </p>
                <p className="text-xs text-muted">
                  <span aria-hidden>🔒 </span>Can open: {f.accessLabel}
                  {" · "}{f.opens === 0 ? "Not opened yet" : `Opened ${f.opens} ${f.opens === 1 ? "time" : "times"}, last by ${f.lastOpened!.by}`}
                </p>
                {f.openedBy && f.openedBy.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer font-bold text-muted hover:text-ink">Who opened it</summary>
                    <ul className="mt-1 space-y-0.5 text-muted">
                      {f.openedBy.map((o, i) => <li key={i}>{o.by} · {dateTime(o.at)}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              {f.canDelete && (
                <button
                  className="text-xs font-bold text-muted hover:text-danger"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Remove ${f.name}? An admin can bring it back.`)) return;
                    start(async () => {
                      const res = await deleteFileAction(f.id);
                      setMsg(res.ok ? null : res.error);
                      router.refresh();
                    });
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="mt-2 text-xs text-muted">{hidden} more {hidden === 1 ? "file" : "files"} you don&rsquo;t have access to.</p>}

      {canUpload && (
        <form className="mt-4 space-y-3 rounded-lg bg-paper p-4" onSubmit={(e) => { e.preventDefault(); upload(); }}>
          <label
            htmlFor={`file-${objectId}`}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-sm ${dragging ? "border-brand bg-brand-soft" : "border-line bg-white"}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); setFile(e.dataTransfer.files[0] ?? null); }}
          >
            <span className="font-bold">{file ? file.name : "Drop a file here, or click to choose one"}</span>
            <span className="text-xs text-muted">{file ? size(file.size) : "PDF, Word, Excel, PowerPoint, images, up to 50 MB"}</span>
            <input id={`file-${objectId}`} ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid gap-3 @md:grid-cols-2">
            <div>
              <label className="label" htmlFor={`file-cat-${objectId}`}>What is it?</label>
              <select id={`file-cat-${objectId}`} className="input" value={category} onChange={(e) => pickCategory(e.target.value as Category)}>
                {(Object.keys(CATEGORY) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="label">Who can open it?</legend>
              <div className="space-y-1 text-sm">
                {([["everyone", "Everyone"], ["commercial", "People who see fees and rates"], ["teams", "Only these departments"]] as [Access, string][]).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name={`file-access-${objectId}`} checked={access === v} onChange={() => setAccess(v)} /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {access === "teams" && (
            <fieldset>
              <legend className="label">Departments</legend>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-line bg-white p-2">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={teamIds.includes(t.id)} onChange={(e) => setTeamIds((v) => (e.target.checked ? [...v, t.id] : v.filter((x) => x !== t.id)))} />
                    {t.name}
                  </label>
                ))}
                {teams.length === 0 && <span className="text-sm text-muted">No departments yet. An admin sets them up in Admin.</span>}
              </div>
            </fieldset>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={!file || !!busy || (access === "teams" && teamIds.length === 0)}>Add file</button>
            {busy && <span className="text-sm text-muted" role="status">{busy}</span>}
            <span className="text-xs text-muted">You and admins can always open what you add.</span>
          </div>
        </form>
      )}
      {msg && <p className="mt-3 text-sm text-danger" role="alert">{msg}</p>}
    </section>
  );
}
