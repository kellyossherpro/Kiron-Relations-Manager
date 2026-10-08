import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ShowWhen } from "./conditions";
import { PermissionError, RuleError } from "./errors";
import { fieldsFor } from "./fields";
import { canManageUsersAndFields, type Actor } from "./permissions";

// Company-wide settings an admin changes in Admin.

// Buttons on every deal page that open another tool, e.g. "RICE evaluation" to the portal.
// A button can show only when a deal field has certain answers.
export type DealButton = { label: string; url: string; showWhen?: ShowWhen | null };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const res = await db.execute(sql`select value from app_settings where key = ${key}`);
  return (res.rows[0]?.value as T | undefined) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.execute(sql`
    insert into app_settings (key, value) values (${key}, ${JSON.stringify(value)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

export const dealButtons = () => getSetting<DealButton[]>("deal_buttons", []);

export async function addDealButton(actor: Actor, input: DealButton) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can change the buttons on deals.");
  const label = input.label.trim();
  const raw = input.url.trim();
  if (!label) throw new RuleError("Give the button a name, e.g. RICE evaluation.");
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (!raw || !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url)) throw new RuleError("Enter the address the button opens, e.g. tools.example.com/page.");
  let showWhen: ShowWhen | null = null;
  if (input.showWhen?.field) {
    const defs = await db.execute(sql`select key, label, type, options, archived from property_definitions where object_type = 'deal'`);
    const f = fieldsFor("deal", defs.rows as never).find((x) => x.key === input.showWhen!.field);
    const answers = f ? (f.type === "yesno" ? ["Yes", "No"] : (f.options ?? [])) : [];
    const values = input.showWhen.values.filter((v) => answers.includes(v));
    if (!f || !values.length) throw new RuleError("Pick the field and the answers that make the button show.");
    showWhen = { field: f.key, values };
  }
  const buttons = await dealButtons();
  if (buttons.some((b) => b.label.toLowerCase() === label.toLowerCase())) throw new RuleError("There's already a button with that name.");
  await setSetting("deal_buttons", [...buttons, { label, url, showWhen }]);
}

export async function removeDealButton(actor: Actor, label: string) {
  if (!canManageUsersAndFields(actor)) throw new PermissionError("Only an admin can change the buttons on deals.");
  await setSetting("deal_buttons", (await dealButtons()).filter((b) => b.label !== label));
}
