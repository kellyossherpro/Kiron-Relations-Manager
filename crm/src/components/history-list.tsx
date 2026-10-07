import { dateTime } from "@/lib/format";

type Entry = { id: number; action: string; field: string | null; oldValue: unknown; newValue: unknown; at: string; userName: string | null };

function show(v: unknown, names: Record<string, string> = {}) {
  if (typeof v === "string" && names[v]) return names[v];
  if (v === null || v === undefined || v === "") return "empty";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Field labels come from the page, so renamed fields read correctly.
export function HistoryList({ entries, labels, stageLabels, names = {} }: { entries: Entry[]; labels: Record<string, string>; stageLabels: Record<string, string>; names?: Record<string, string> }) {
  if (entries.length === 0) return <p className="text-sm text-muted">No changes yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((e) => {
        let text: React.ReactNode;
        if (e.action === "create") text = "Created this record";
        else if (e.action === "delete") text = "Deleted this record";
        else if (e.action === "restore") text = "Restored this record";
        else if (e.action === "stage") {
          const nv = e.newValue as { stage: string; reason?: string };
          text = (
            <>
              Moved from <strong>{stageLabels[String(e.oldValue)] ?? show(e.oldValue)}</strong> to <strong>{stageLabels[nv.stage] ?? nv.stage}</strong>
              {nv.reason && <span className="text-muted"> · &ldquo;{nv.reason}&rdquo;</span>}
            </>
          );
        } else if (e.action === "link" || e.action === "unlink") text = e.action === "link" ? "Added a link" : "Removed a link";
        else
          text = (
            <>
              Changed <strong>{labels[e.field ?? ""] ?? e.field}</strong> from <span className="text-muted">{show(e.oldValue, names)}</span> to <strong>{show(e.newValue, names)}</strong>
            </>
          );
        return (
          <li key={e.id} className="flex flex-wrap gap-x-2 border-b border-line pb-2 last:border-0">
            <span className="w-32 shrink-0 text-xs text-muted tabular-nums">{dateTime(e.at)}</span>
            <span className="w-32 shrink-0 text-xs font-bold">{e.userName ?? "System"}</span>
            <span className="min-w-0 flex-1">{text}</span>
          </li>
        );
      })}
    </ol>
  );
}
