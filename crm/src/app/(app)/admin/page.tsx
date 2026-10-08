import { AdminFields } from "@/components/admin-fields";
import { AdminStageRules } from "@/components/admin-stage-rules";
import { kironPipelineSummary } from "@/lib/kiron-pipeline";
import { conditionText, loadPipelineConfig, requirementLabel } from "@/lib/stage-engine";
import { db } from "@/db";
import { AdminUsers } from "@/components/admin-users";
import { canManageUsersAndFields } from "@/lib/permissions";
import { listDefinitions, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const actor = await requireActor();
  if (!canManageUsersAndFields(actor)) return <p>Only admins can see this page.</p>;
  const [users, defs, cfg] = await Promise.all([listUsers(true), listDefinitions(undefined, true), loadPipelineConfig(db)]);
  return (
    <div className="space-y-5">
      <h1 className="h1">Admin</h1>
      <AdminUsers users={users} meId={actor.id} />
      <AdminFields defs={defs} />
      <AdminStageRules
        playbook={kironPipelineSummary()}
        stages={cfg.stages}
        fields={cfg.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
        requirements={cfg.requirements.map((r) => ({ id: r.id, stageKey: r.stageKey, label: requirementLabel(cfg, r) }))}
        routes={cfg.transitions.map((t) => ({ id: t.id, fromStage: t.fromStage, toStage: t.toStage, condition: conditionText(cfg, t.whenField, t.whenValue) }))}
      />
    </div>
  );
}
