import "server-only";
import type { ObjectType } from "@/db/schema";
import type { ClientField } from "@/components/field-input";
import type { FieldSpec } from "./fields";
import { canEditField, canSeeField, type Actor } from "./permissions";

// The fields a page shows, each marked with whether this person may edit it.
export function clientFields(actor: Actor, objectType: ObjectType, ownerId: string | null, specs: FieldSpec[], collaboratorIds: string[] = []): ClientField[] {
  return specs.map((s) => ({
    key: s.key,
    label: s.label,
    type: s.type,
    options: s.options,
    required: s.required,
    group: s.group,
    showWhen: s.showWhen ?? null,
    editable: canEditField(actor, objectType, { ownerId }, s, { collaboratorIds }),
  }));
}

// Leaves out what this person isn't allowed to see (fees and rates, unless their role or a
// department lets them) from the fields and values sent to the page. `hidden` is for visibleHistory.
export function visibleRecord<R>(actor: Actor, record: { row: R; specs: FieldSpec[]; values: Record<string, unknown> }) {
  const hidden = new Set(record.specs.filter((s) => !canSeeField(actor, s)).map((s) => s.key));
  return {
    row: record.row,
    specs: record.specs.filter((s) => !hidden.has(s.key)),
    values: Object.fromEntries(Object.entries(record.values).filter(([k]) => !hidden.has(k))),
    hidden,
  };
}

export function visibleHistory<E extends { field: string | null }>(history: E[], hidden: Set<string>) {
  return history.filter((e) => !e.field || !hidden.has(e.field));
}
