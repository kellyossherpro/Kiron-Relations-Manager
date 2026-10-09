import { dateTime, money } from "@/lib/format";

const GO_LIVE_LABEL: Record<string, string> = { legal: "Legal", finance: "Finance", support: "Support", dev: "Dev" };

const FILE_LABEL: Record<string, string> = { proposal: "Proposal", rice_report: "RICE report", contract: "Contract", other: "Other" };

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
export function HistoryList({ entries, labels, stageLabels, names = {}, moneyFields = [] }: { entries: Entry[]; labels: Record<string, string>; stageLabels: Record<string, string>; names?: Record<string, string>; moneyFields?: string[] }) {
  const value = (field: string | null, v: unknown) => (field && moneyFields.includes(field) && v !== null && v !== "" ? money(v) : show(v, names));
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
        } else if (e.action === "go_live") {
          const nv = e.newValue as { confirmed: boolean; note?: string | null };
          const which = GO_LIVE_LABEL[(e.field ?? "").replace("go_live.", "")] ?? "a";
          text = nv.confirmed ? (
            <>Confirmed the <strong>{which}</strong> go-live handover{nv.note && <span className="text-muted"> · &ldquo;{nv.note}&rdquo;</span>}</>
          ) : (
            <>Undid the <strong>{which}</strong> go-live handover</>
          );
        } else if (e.action === "import") {
          const nv = e.newValue as { hubspotId?: string | null; outcome?: string };
          text = <>{nv.outcome === "updated" ? "Updated from HubSpot" : "Brought in from HubSpot"}{nv.hubspotId && <span className="text-muted"> · Record ID {nv.hubspotId}</span>}</>;
        } else if (e.action === "file") {
          // The file's name isn't shown: not everyone who reads the history may open the file.
          const nv = e.newValue as { category: string; added: boolean };
          text = <>{nv.added ? "Added" : "Removed"} a file: <strong>{FILE_LABEL[nv.category] ?? "Other"}</strong></>;
        } else if (e.action === "link" || e.action === "unlink") text = e.action === "link" ? "Added a link" : "Removed a link";
        else
          text = (
            <>
              Changed <strong>{labels[e.field ?? ""] ?? e.field}</strong> from <span className="text-muted">{value(e.field, e.oldValue)}</span> to <strong>{value(e.field, e.newValue)}</strong>
            </>
          );
        return (
          <li key={e.id} className="border-b border-line pb-2 last:border-0">
            <p className="text-xs text-muted">
              <span className="tabular-nums">{dateTime(e.at)}</span> · <span className="font-bold text-ink">{e.userName ?? "System"}</span>
            </p>
            <p className="mt-0.5 break-words">{text}</p>
          </li>
        );
      })}
    </ol>
  );
}
