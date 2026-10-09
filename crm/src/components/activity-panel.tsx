"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteActivityAction, logActivityAction, setTaskDoneAction } from "@/app/actions";
import type { ActivityItem } from "@/lib/queries";
import { date, dateTime } from "@/lib/format";
import { SearchSelect, type Option } from "./search-select";

const TYPES = [
  { key: "note", label: "Note" },
  { key: "call", label: "Call" },
  { key: "meeting", label: "Meeting" },
  { key: "task", label: "Task" },
] as const;

const TYPE_LABEL: Record<string, string> = { note: "Note", call: "Call", meeting: "Meeting", task: "Task", email: "Email" };

export function ActivityPanel({
  parent,
  items,
  users,
  me,
  canLog,
}: {
  parent: { dealId?: string; companyId?: string; contactId?: string };
  items: ActivityItem[];
  users: Option[];
  me: { id: string; isAdmin: boolean };
  canLog: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");
  const [assignee, setAssignee] = useState<string | null>(me.id);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isTask = type === "task";

  function add() {
    start(async () => {
      const res = await logActivityAction({
        type,
        subject: isTask || type === "meeting" || type === "call" ? subject : undefined,
        body,
        dueAt: isTask && when ? when : undefined,
        occurredAt: !isTask && when ? when : undefined,
        assignedTo: isTask ? (assignee ?? undefined) : undefined,
        ...parent,
      });
      if (res.ok) {
        setSubject("");
        setBody("");
        setWhen("");
        setError(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <section className="card @container p-5" aria-label="Activity">
      <h2 className="h2 mb-4">Activity</h2>
      {canLog && (
        <div className="mb-6 rounded-lg bg-paper p-4">
          <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={type === t.key}
                onClick={() => setType(t.key)}
                className={`pill border px-3 py-1 ${type === t.key ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {type !== "note" && (
              <div>
                <label className="label" htmlFor="act-subject">{isTask ? "What needs doing" : "Subject"}</label>
                <input id="act-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="act-body">{isTask ? "Details (optional)" : "Notes"}</label>
              <textarea id="act-body" className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid gap-3 @md:grid-cols-2">
              <div>
                <label className="label" htmlFor="act-when">{isTask ? "Due date" : "When (leave empty for now)"}</label>
                <input id="act-when" type={isTask ? "date" : "datetime-local"} className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              {isTask && (
                <div>
                  <label className="label" htmlFor="act-assignee">Assigned to</label>
                  <SearchSelect id="act-assignee" options={users} value={assignee} onChange={setAssignee} allowEmpty={false} />
                </div>
              )}
            </div>
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <button className="btn-primary" onClick={add} disabled={pending}>{pending ? "Saving…" : `Add ${TYPE_LABEL[type].toLowerCase()}`}</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged yet.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((a) => {
            const isOpenTask = a.type === "task" && !a.completedAt;
            const overdue = isOpenTask && a.dueAt && new Date(a.dueAt) < new Date();
            const canComplete = me.isAdmin || a.assignedTo === me.id || a.createdBy === me.id;
            return (
              <li key={a.id} className={`rounded-lg border p-3 ${isOpenTask ? "border-ink/30 bg-white" : "border-line bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`pill ${a.type === "task" ? "bg-ink text-white" : "bg-paper text-ink"}`}>{TYPE_LABEL[a.type] ?? a.type}</span>
                  {a.type === "task" ? (
                    <>
                      <span className={overdue ? "font-bold text-danger" : "text-muted"}>
                        {a.completedAt ? `Done ${date(a.completedAt)}` : a.dueAt ? `Due ${date(a.dueAt)}${overdue ? " · overdue" : ""}` : "No due date"}
                      </span>
                      <span className="text-muted">· {a.assignedToName ?? "Unassigned"}</span>
                    </>
                  ) : (
                    <span className="text-muted">{dateTime(a.occurredAt)} · {a.createdByName ?? "Someone"}</span>
                  )}
                  <span className="ml-auto flex gap-3">
                    {a.type === "task" && canComplete && (
                      <button className="font-bold text-brand-dark hover:underline" onClick={() => act(() => setTaskDoneAction(a.id, !a.completedAt))}>
                        {a.completedAt ? "Reopen" : "Mark done"}
                      </button>
                    )}
                    {(me.isAdmin || a.createdBy === me.id) && (
                      <button className="text-muted hover:text-danger" onClick={() => act(() => deleteActivityAction(a.id))} aria-label="Delete">Delete</button>
                    )}
                  </span>
                </div>
                {a.subject && <p className={`mt-2 text-sm font-bold ${a.completedAt ? "text-muted line-through" : ""}`}>{a.subject}</p>}
                {a.body && <p className="mt-1 text-sm whitespace-pre-wrap">{a.body}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
