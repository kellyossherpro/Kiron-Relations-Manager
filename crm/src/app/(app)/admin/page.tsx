import { AdminFields } from "@/components/admin-fields";
import { AdminUsers } from "@/components/admin-users";
import { canManageUsersAndFields } from "@/lib/permissions";
import { listDefinitions, listStages, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const actor = await requireActor();
  if (!canManageUsersAndFields(actor)) return <p>Only admins can see this page.</p>;
  const [users, defs, stages] = await Promise.all([listUsers(true), listDefinitions(undefined, true), listStages()]);
  return (
    <div className="space-y-5">
      <h1 className="h1">Admin</h1>
      <AdminUsers users={users} meId={actor.id} />
      <AdminFields defs={defs} />
      <section className="card p-5" aria-label="Pipeline stages">
        <h2 className="h2 mb-1">Pipeline stages</h2>
        <p className="mb-3 text-sm text-muted">The stage rules (what each stage needs before a deal moves on) come in the next build step.</p>
        <ol className="flex flex-wrap gap-2">
          {stages.map((s) => <li key={s.key} className="pill border border-line bg-white px-3 py-1">{s.position}. {s.label}</li>)}
        </ol>
      </section>
    </div>
  );
}
