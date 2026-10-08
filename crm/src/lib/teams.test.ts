import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { joinTeam, makeUser, resetDb } from "@/test/helpers";
import { createFieldDefinition, createUser } from "./admin";
import { PermissionError, RuleError } from "./errors";
import { fieldsFor } from "./fields";
import { KIRON_ORG } from "./kiron-org";
import { canEditField, canSeeField } from "./permissions";
import { createRecord, updateRecord } from "./records";
import { signOffsWaiting } from "./stage-engine";
import { addRequirement, listNotifications } from "./stage-rules-admin";
import { addTeamMember, applyKironOrg, createTeam, deleteTeam, listTeams, removeTeamMember, TECH_REVIEWERS, updateTeam } from "./teams";
import { visibleHistory, visibleRecord } from "./view";
import { getRecord, listHistory } from "./queries";

beforeEach(resetDb);
afterAll(() => pool.end());

const userNamed = async (name: string) => (await db.execute(sql`select id, role, email, title from users where name = ${name}`)).rows[0];

describe("setting up Kiron's people", () => {
  it("adds every department and person once, without email addresses", async () => {
    await expect(applyKironOrg(await makeUser("manager"))).rejects.toThrow(PermissionError);
    const admin = await makeUser("admin", "Kelly Ossher");
    const people = new Set(KIRON_ORG.flatMap((d) => d.people.map((p) => p.name)));

    expect(await applyKironOrg(admin)).toEqual({ departments: KIRON_ORG.length, peopleAdded: people.size - 1, peopleFound: 1 });
    const teams = await listTeams();
    expect(teams.filter((t) => t.kind === "department")).toHaveLength(KIRON_ORG.length);
    expect((await db.execute(sql`select count(*)::int as n from users where email is null`)).rows[0].n).toBe(people.size - 1);

    // Starting roles by department; the person who set KRM up keeps theirs and gets a job title.
    expect((await userNamed("Paul Shackleton")).role).toBe("manager"); // Executive
    expect((await userNamed("Oswald Whelpton")).role).toBe("viewer"); // Dev reads, and signs off below
    expect(await userNamed("Kelly Ossher")).toMatchObject({ role: "admin", email: expect.stringContaining("@example.test"), title: expect.any(String) });
    expect(teams.find((t) => t.name === "Finance")!.seesCommercials).toBe(true);
    expect(teams.find((t) => t.name === "Support & Installations")!.seesCommercials).toBe(false);
    const reviewers = teams.find((t) => t.name === TECH_REVIEWERS)!;
    expect(reviewers).toMatchObject({ kind: "group" });
    expect(reviewers.members.map((m) => m.name)).toEqual(["Craig Jennison", "Oswald Whelpton"]);

    // Running it again changes nothing.
    expect(await applyKironOrg(admin)).toMatchObject({ peopleAdded: 0 });
    expect((await db.execute(sql`select count(*)::int as n from users`)).rows[0].n).toBe(people.size + 1); // + the manager above
  });

  it("people can be added without an email, but not with a broken one", async () => {
    const admin = await makeUser("admin");
    await createUser(admin, { name: "Pat Example", role: "viewer", title: "Analyst" });
    expect(await userNamed("Pat Example")).toMatchObject({ email: null, title: "Analyst" });
    await expect(createUser(admin, { name: "Sam Example", email: "not-an-email", role: "viewer" })).rejects.toThrow(RuleError);
  });
});

describe("departments and groups", () => {
  it("only admins change them, names are unique, and a group that signs off a field stays", async () => {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    await expect(createTeam(sales, { name: "Backups", kind: "group" })).rejects.toThrow(PermissionError);
    const id = (await createTeam(admin, { name: "Backups", kind: "group" }))!;
    await expect(createTeam(admin, { name: "backups", kind: "group" })).rejects.toThrow("already exists");
    await addTeamMember(admin, id, sales.id);
    await updateTeam(admin, id, { seesCommercials: true });
    expect((await listTeams())[0]).toMatchObject({ name: "Backups", seesCommercials: true, members: [{ id: sales.id }] });
    await removeTeamMember(admin, id, sales.id);
    expect((await listTeams())[0].members).toEqual([]);

    await createFieldDefinition(admin, { objectType: "deal", label: "Security check", type: "yesno", editTeamId: id });
    await expect(deleteTeam(admin, id)).rejects.toThrow('It signs off "Security check"');
    await db.execute(sql`update property_definitions set edit_team_id = null`);
    await deleteTeam(admin, id);
    expect(await listTeams()).toEqual([]);
  });
});

describe("fees and rates", () => {
  it("are hidden from read-only people unless their department sees them", async () => {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    const support = await joinTeam(await makeUser("viewer"), "Support & Installations");
    const finance = await joinTeam(await makeUser("viewer"), "Finance", { seesCommercials: true });
    await createFieldDefinition(admin, { objectType: "deal", label: "Setup fee", type: "money", commercial: true });
    const deal = await createRecord(sales, "deal", { name: "Example deal", "p.setup_fee": "5000" });
    await updateRecord(sales, "deal", deal, { "p.setup_fee": "6000" }, { "p.setup_fee": "5000" });

    const record = await getRecord("deal", deal);
    const fee = record.specs.find((s) => s.key === "p.setup_fee")!;
    expect([sales, support, finance].map((a) => canSeeField(a, fee))).toEqual([true, false, true]);

    const seen = visibleRecord(support, record);
    expect(seen.specs.map((s) => s.key)).not.toContain("p.setup_fee");
    expect(seen.values).not.toHaveProperty("p.setup_fee");
    expect(visibleHistory(await listHistory("deal", deal), seen.hidden).map((h) => h.field)).toEqual([null]); // only "created"
    expect(visibleRecord(finance, record).values["p.setup_fee"]).toBe("6000.00");
    // Seeing isn't editing: Finance is still read-only.
    expect(canEditField(finance, "deal", { ownerId: sales.id }, fee)).toBe(false);
  });
});

describe("sign-offs", () => {
  async function setUp() {
    const admin = await makeUser("admin");
    const sales = await makeUser("sales");
    const group = (await createTeam(admin, { name: TECH_REVIEWERS, kind: "group" }))!;
    const reviewer = await joinTeam(await makeUser("viewer", "Rae Reviewer"), TECH_REVIEWERS);
    await createFieldDefinition(admin, { objectType: "deal", label: "Technical review performed", type: "yesno", editTeamId: group });
    await addRequirement(admin, { stageKey: "customer_engagement", kind: "field", fieldKey: "p.technical_review_performed", requiredValues: ["Yes"] });
    await addRequirement(admin, { stageKey: "lead", kind: "field", fieldKey: "amountMonthly" });
    return { admin, sales, group, reviewer };
  }

  it("only the group fills it in, everyone in it is told, and it waits on their list", async () => {
    const { admin, sales, group, reviewer } = await setUp();
    const deal = await createRecord(sales, "deal", { name: "Example deal" });
    await expect(createRecord(sales, "deal", { name: "Sneaky", "p.technical_review_performed": "yes" })).rejects.toThrow(PermissionError);

    // A backup joins for while someone is away; they hear about deals from then on too.
    const backup = await makeUser("viewer", "Bo Backup");
    await addTeamMember(admin, group, backup.id);
    await updateRecord(sales, "deal", deal, { amountMonthly: "5000" }, { amountMonthly: null });
    for (const p of [reviewer, backup]) {
      expect((await listNotifications(p.id)).map((n) => n.kind)).toEqual(["signoff_needed"]);
    }
    expect(await signOffsWaiting(reviewer.teamIds!)).toMatchObject([{ dealId: deal, stageLabel: "Customer Engagement", label: "Technical review performed" }]);
    expect(await signOffsWaiting([])).toEqual([]);

    const spec = fieldsFor("deal", [{ key: "technical_review_performed", label: "x", type: "yesno", options: [], groupLabel: null, extraEditorRoles: [], editTeam: group, archived: false }]).at(-1)!;
    expect(canEditField(sales, "deal", { ownerId: sales.id }, spec)).toBe(false);
    expect(canEditField(admin, "deal", { ownerId: sales.id }, spec)).toBe(true); // admins can step in

    await updateRecord({ ...backup, teamIds: [group] }, "deal", deal, { "p.technical_review_performed": true }, { "p.technical_review_performed": null });
    expect(await signOffsWaiting(reviewer.teamIds!)).toEqual([]);
  });
});
