import "server-only";
import type { ObjectType } from "@/db/schema";
import type { ClientField } from "@/components/field-input";
import type { FieldSpec } from "./fields";
import { canEditField, type Actor } from "./permissions";

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
