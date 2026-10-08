import { AdminDealButtons } from "@/components/admin-deal-buttons";
import { AdminFields } from "@/components/admin-fields";
import { AdminStageRules } from "@/components/admin-stage-rules";
import { kironPipelineSummary } from "@/lib/kiron-pipeline";
import { conditionText, loadPipelineConfig, requirementLabel } from "@/lib/stage-engine";
import { db } from "@/db";
import { AdminTeams } from "@/components/admin-teams";
import { AdminUsers } from "@/components/admin-users";
import { canManageUsersAndFields } from "@/lib/permissions";
import { listDefinitions, listUsers } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { dealButtons } from "@/lib/settings";
import { kironOrgSetUp, listTeams, teamNamesByUser } from "@/lib/teams";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const actor = await requireActor();
  if (!canManageUsersAndFields(actor)) return <p>Only admins can see this page.</p>;
  const [users, defs, cfg, buttons, teams, teamNames, kironSetUp] = await Promise.all([
    listUsers(true), listDefinitions(undefined, true), loadPipelineConfig(db), dealButtons(), listTeams(), teamNamesByUser(), kironOrgSetUp(),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="h1">Admin</h1>
      <AdminUsers users={users.map((u) => ({ ...u, teams: teamNames[u.id] ?? [] }))} meId={actor.id} />
      <AdminTeams teams={teams} kironSetUp={kironSetUp} people={users.filter((u) => u.active).map((u) => ({ id: u.id, label: u.title ? `${u.name} · ${u.title}` : u.name }))} />
      <AdminFields defs={defs} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
      <AdminStageRules
        playbook={kironPipelineSummary()}
        stages={cfg.stages}
        fields={cfg.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
        companyFields={cfg.companyFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
        requirements={cfg.requirements.map((r) => ({ id: r.id, stageKey: r.stageKey, label: requirementLabel(cfg, r) }))}
        routes={cfg.transitions.map((t) => ({ id: t.id, fromStage: t.fromStage, toStage: t.toStage, condition: conditionText(cfg, t.whenField, t.whenValue) }))}
      />
      <AdminDealButtons buttons={buttons} fields={cfg.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))} />
    </div>
  );
}
