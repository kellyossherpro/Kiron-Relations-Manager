"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { finishImportAction, importChunkAction, startImportAction, undoImportAction } from "@/app/actions";
import { readSpreadsheet, type Sheet } from "@/lib/import/parse";
import { SPECIAL, SPECIALS_FOR, suggestMapping, suggestStages, type ImportObject, type Target } from "@/lib/import/plan";
import type { RowResult } from "@/lib/import/run";
import type { FieldSpec } from "@/lib/fields";
import { dateTime } from "@/lib/format";

// Rows per trip to the server: at most 150, and well under the 1 MB a server action accepts.
const CHUNK_ROWS = 150;
const CHUNK_BYTES = 600_000;
function chunks(rows: string[][]): [number, number][] {
  const out: [number, number][] = [];
  let start = 0;
  let bytes = 0;
  rows.forEach((r, i) => {
    const size = JSON.stringify(r).length * 2;
    if (i > start && (i - start >= CHUNK_ROWS || bytes + size > CHUNK_BYTES)) {
      out.push([start, i]);
      start = i;
      bytes = 0;
    }
    bytes += size;
  });
  out.push([start, rows.length]);
  return out;
}
const OBJECTS: { key: ImportObject; label: string; what: string }[] = [
  { key: "company", label: "1. Companies", what: "companies" },
  { key: "contact", label: "2. Contacts", what: "contacts" },
  { key: "deal", label: "3. Deals", what: "deals" },
];

type PastImport = { id: string; objectType: ImportObject; fileName: string; createdAt: string; created: number; updated: number; skipped: number; finishedAt: string | null; undoneAt: string | null; byName: string };
type Props = {
  specs: Record<ImportObject, FieldSpec[]>;
  stages: { key: string; label: string }[];
  remembered: Record<ImportObject, Record<string, Target>>;
  past: PastImport[];
};
type Summary = { kind: "check" | "import"; results: RowResult[]; importId?: string };

/**
 * Bring in from HubSpot: pick the export, check how its columns match KRM's fields, run a check that
 * changes nothing, then bring it in. Companies first, then contacts, then deals, so links can be made.
 */
export function ImportWizard({ specs, stages, remembered, past }: Props) {
  const router = useRouter();
  const [objectType, setObjectType] = useState<ImportObject>("company");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = specs[objectType].filter((s) => !s.derive);
  const what = OBJECTS.find((o) => o.key === objectType)!.what;

  function reset(next: ImportObject) {
    setObjectType(next);
    setSheet(null);
    setFileName("");
    setSummary(null);
    setError(null);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSummary(null);
    try {
      const s = await readSpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!s.rows.length) throw new Error("That file has no rows under its header.");
      const m = suggestMapping(objectType, s.headers, specs[objectType], remembered[objectType]);
      setSheet(s);
      setFileName(file.name);
      setMapping(m);
      setStageMap(stageValues(s, m).length ? suggestStages(stageValues(s, m), stages) : {});
    } catch (e) {
      setSheet(null);
      setError(e instanceof Error ? e.message : "KRM couldn't read that file.");
    }
  }

  const stageCol = mapping.indexOf("special:stage");
  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (sheet && stageCol >= 0) for (const r of sheet.rows) if (r[stageCol]) counts.set(r[stageCol], (counts.get(r[stageCol]) ?? 0) + 1);
    return [...counts];
  }, [sheet, stageCol]);
  const dupes = mapping.filter((t, i) => t && mapping.indexOf(t) !== i);
  const nameMapped = objectType === "contact" ? mapping.includes("email") || mapping.includes("phone") : mapping.includes("name");

  async function go(kind: "check" | "import") {
    if (!sheet) return;
    setError(null);
    setSummary(null);
    let importId: string | null = null;
    if (kind === "import") {
      const started = await startImportAction({ objectType, fileName });
      if (!started.ok) return setError(started.error);
      importId = started.id!;
    }
    const all: RowResult[] = [];
    for (const [from, to] of chunks(sheet.rows)) {
      setBusy(`${kind === "check" ? "Checking" : "Bringing in"} rows ${from + 1}–${to} of ${sheet.rows.length}…`);
      const res = await importChunkAction({ objectType, importId, headers: sheet.headers, rows: sheet.rows.slice(from, to), firstRow: from + 2, mapping, stageMap });
      if (!res.ok) { setBusy(null); return setError(res.error); }
      all.push(...res.results);
    }
    if (importId) await finishImportAction(importId, objectType, sheet.headers, mapping);
    setBusy(null);
    setSummary({ kind, results: all, importId: importId ?? undefined });
    if (kind === "import") router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="card p-5" aria-label="What are you bringing in">
        <h2 className="h2 mb-1">What are you bringing in?</h2>
        <p className="mb-4 text-sm text-muted">Do them in this order, so contacts can be linked to their companies and deals to both.</p>
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-white p-0.5 text-sm font-bold sm:w-fit" role="tablist">
          {OBJECTS.map((o) => (
            <button key={o.key} role="tab" aria-selected={objectType === o.key} className={`rounded-md px-3 py-1.5 ${objectType === o.key ? "bg-ink text-white" : ""}`} onClick={() => reset(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-line bg-paper p-5 text-center text-sm">
          <span className="font-bold">{fileName || `Choose HubSpot's ${what} export`}</span>
          <span className="text-xs text-muted">{sheet ? `${sheet.rows.length} rows, ${sheet.headers.length} columns` : "The .xlsx or .csv file from HubSpot → Export. Nothing is saved until you press “Bring in”."}</span>
          <input type="file" accept=".xlsx,.csv" className="sr-only" aria-label={`HubSpot ${what} export`} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </section>

      {sheet && (
        <section className="card p-5" aria-label="Columns">
          <h2 className="h2 mb-1">Where each column goes</h2>
          <p className="mb-3 text-sm text-muted">
            KRM matched the columns it recognised. Check the ones marked <strong>Left out</strong>: pick a field for any you want to keep.
            Fields KRM fills in by itself (like Customer tier) are worked out, not copied.
          </p>
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs tracking-wide text-muted uppercase">
                <tr><th className="p-2">HubSpot column</th><th className="p-2">Example</th><th className="p-2">Goes to</th></tr>
              </thead>
              <tbody>
                {sheet.headers.map((h, i) => {
                  const example = sheet.rows.find((r) => r[i])?.[i] ?? "";
                  const t = mapping[i];
                  return (
                    <tr key={i} className={`border-t border-line ${t ? "" : "bg-paper/60"}`}>
                      <td className="p-2 font-bold">{h || <span className="text-muted">(no header)</span>}</td>
                      <td className="max-w-56 truncate p-2 text-muted" title={example}>{example || "—"}</td>
                      <td className="p-2">
                        <select
                          aria-label={`Where ${h} goes`}
                          className={`input py-1 ${t && dupes.includes(t) ? "border-danger" : ""}`}
                          value={t ?? ""}
                          onChange={(e) => {
                            const next = [...mapping];
                            next[i] = e.target.value || null;
                            setMapping(next);
                            if (next[i] === "special:stage") setStageMap(suggestStages(stageValues(sheet, next), stages));
                            setSummary(null);
                          }}
                        >
                          <option value="">Left out</option>
                          <optgroup label="Linking and dates">
                            {SPECIALS_FOR[objectType].map((sp) => <option key={sp} value={`special:${sp}`}>{SPECIAL[sp]}</option>)}
                          </optgroup>
                          <optgroup label="KRM fields">
                            {fields.map((f) => <option key={f.key} value={f.key}>{f.group ? `${f.label} (${f.group})` : f.label}</option>)}
                          </optgroup>
                        </select>
                        {t && dupes.includes(t) && <p className="mt-1 text-xs text-danger">Two columns go to the same place. Pick one.</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!mapping.includes("special:hubspotId") && (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">No column goes to <strong>HubSpot Record ID</strong>. Without it, running the import again creates duplicates instead of updating.</p>
          )}
        </section>
      )}

      {sheet && stageCounts.length > 0 && (
        <section className="card p-5" aria-label="Stages">
          <h2 className="h2 mb-1">HubSpot stages → KRM stages</h2>
          <p className="mb-3 text-sm text-muted">Deals keep their stage. Ones with no KRM stage chosen start in the first stage.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {stageCounts.map(([value, n]) => (
              <label key={value} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1"><strong>{value}</strong> <span className="text-muted">({n})</span></span>
                <select className="input w-56 py-1" value={stageMap[value] ?? ""} onChange={(e) => { setStageMap({ ...stageMap, [value]: e.target.value || null }); setSummary(null); }}>
                  <option value="">First stage</option>
                  {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {sheet && (
        <section className="card p-5" aria-label="Check and bring in">
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-dark" disabled={!!busy || dupes.length > 0 || !nameMapped} onClick={() => go("check")}>Check first (changes nothing)</button>
            <button className="btn-primary" disabled={!!busy || dupes.length > 0 || !nameMapped || summary?.kind !== "check"} onClick={() => go("import")}>
              Bring in {sheet.rows.length} {what}
            </button>
            {busy && <span className="text-sm text-muted" role="status">{busy}</span>}
          </div>
          {!nameMapped && <p className="mt-2 text-sm text-danger">Pick the column with the {objectType === "contact" ? "email address" : objectType === "deal" ? "deal name" : "company name"}.</p>}
          {summary?.kind !== "check" && !summary && <p className="mt-2 text-xs text-muted">Run the check first; then bring them in.</p>}
          {summary && <Results summary={summary} what={what} onUndo={(id) => undo(id)} />}
        </section>
      )}

      <section className="card p-5" aria-label="Past imports">
        <h2 className="h2 mb-3">Past imports</h2>
        {past.length === 0 ? <p className="text-sm text-muted">Nothing brought in yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {past.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{p.fileName}</strong>
                  <span className="text-muted"> · {OBJECTS.find((o) => o.key === p.objectType)?.what} · {dateTime(p.createdAt)} by {p.byName}</span>
                  <br />
                  <span className="text-xs text-muted">{p.created} new · {p.updated} updated · {p.skipped} skipped{!p.finishedAt && " · didn't finish"}</span>
                </span>
                {p.undoneAt ? <span className="pill bg-paper text-muted">Undone</span> : p.created > 0 && (
                  <button className="text-xs font-bold text-muted hover:text-danger" disabled={!!busy} onClick={() => undo(p.id)}>Undo ({p.created} new {p.created === 1 ? "record" : "records"})</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  async function undo(id: string) {
    if (!confirm("Delete everything this import created? Updates it made stay. Deleted records can be restored for 30 days.")) return;
    setBusy("Undoing…");
    const res = await undoImportAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      setSummary(null);
      router.refresh();
    }
  }
}

function stageValues(sheet: Sheet, mapping: Target[]) {
  const col = mapping.indexOf("special:stage");
  return col < 0 ? [] : [...new Set(sheet.rows.map((r) => r[col]).filter(Boolean))];
}

function Results({ summary, what, onUndo }: { summary: Summary; what: string; onUndo: (id: string) => void }) {
  const { results, kind } = summary;
  const n = (k: RowResult["outcome"]) => results.filter((r) => r.outcome === k).length;
  const problems = results.flatMap((r) => r.problems.map((p) => ({ ...p, row: r.row, label: r.label, skipped: r.outcome === "skipped" })));
  const shown = problems.slice(0, 200);

  function download() {
    const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = ["Row,Record,Column,Value,What happens", ...problems.map((p) => [p.row, p.label, p.column, p.value, p.message].map(esc).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
    a.download = `KRM import problems (${what}).csv`;
    a.click();
  }

  return (
    <div className="mt-4 space-y-3" role="status">
      <p className="text-sm font-bold">{kind === "check" ? "Check done: nothing was saved. If this looks right, press Bring in." : "Done."}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={kind === "check" ? "Would be new" : "New"} value={n("created")} />
        <Tile label={kind === "check" ? "Would update" : "Updated"} value={n("updated")} />
        <Tile label="Skipped" value={n("skipped")} tone={n("skipped") ? "danger" : undefined} />
        <Tile label="Cells with a problem" value={problems.filter((p) => !p.skipped).length} tone={problems.length ? "warn" : undefined} />
      </div>
      {problems.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">Fix these in the spreadsheet and run it again, or bring it in as it is: the rest of each row still comes in.</p>
            <button className="btn-ghost" onClick={download}>Download the list (.csv)</button>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs tracking-wide text-muted uppercase">
                <tr><th className="p-2">Row</th><th className="p-2">Record</th><th className="p-2">Column</th><th className="p-2">What happens</th></tr>
              </thead>
              <tbody>
                {shown.map((p, i) => (
                  <tr key={i} className={`border-t border-line ${p.skipped ? "bg-danger-soft" : ""}`}>
                    <td className="p-2 tabular-nums">{p.row}</td>
                    <td className="p-2">{p.label}</td>
                    <td className="p-2">{p.column || "—"}</td>
                    <td className="p-2">{p.message}{p.skipped && " (row skipped)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.length > shown.length && <p className="text-xs text-muted">And {problems.length - shown.length} more in the downloaded list.</p>}
        </>
      )}
      {kind === "import" && summary.importId && n("created") > 0 && (
        <button className="text-xs font-bold text-muted hover:text-danger" onClick={() => onUndo(summary.importId!)}>Undo this import</button>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "danger" ? "border-danger/30 bg-danger-soft" : tone === "warn" ? "border-warn/30 bg-warn-soft" : "border-line bg-white"}`}>
      <p className="text-xs font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}

