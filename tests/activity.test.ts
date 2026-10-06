import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { deleteAccount, deleteOrganization, exportOrganization } from "@/lib/account";
import {
  changedFields,
  describe as describeRecord,
  editSummary,
  FIELD_LABELS,
  listActivity,
  recordActivity,
  subjectHistory,
  subjectLinks,
} from "@/lib/activity";
import { changeMemberRole, createAccountFromInvitation, issueInvitation, removeMember, revokeInvitation } from "@/lib/team";

const { activityLog, invitations, memberships, organizations, processingActivities, users } = schema;

let db: Db;
let orgId: string;
let otherOrgId: string;
let owner: string;
let admin: string;
let member: string;

const t0 = new Date("2026-10-06T09:00:00Z");
const later = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

async function addOrg(name: string): Promise<string> {
  const [o] = await db.insert(organizations).values({ name, sector: "education", size: "micro_small" }).returning({ id: organizations.id });
  return o.id;
}

async function addUser(email: string, name: string): Promise<string> {
  const [u] = await db.insert(users).values({ email, name, passwordHash: "scrypt$secret-hash", emailVerifiedAt: t0 }).returning({ id: users.id });
  return u.id;
}

const summaries = async () =>
  (await db.select({ summary: activityLog.summary }).from(activityLog).orderBy(activityLog.createdAt, activityLog.summary)).map((r) => r.summary);

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;

  orgId = await addOrg("Sunrise Academy");
  otherOrgId = await addOrg("Moonset College");
  owner = await addUser("owner@sunrise.ke", "Wanjiku");
  admin = await addUser("admin@sunrise.ke", "Otieno");
  member = await addUser("member@sunrise.ke", "Achieng");
  await db.insert(memberships).values([
    { orgId, userId: owner, role: "owner" },
    { orgId, userId: admin, role: "admin" },
    { orgId, userId: member, role: "member" },
  ]);
});

describe("changedFields", () => {
  const labels = { name: "name", notes: "notes", issuedOn: "issue date", tags: "tags" };

  it("names only the fields that differ, in label order", () => {
    expect(changedFields({ name: "A", notes: "x" }, { notes: "y", name: "B" }, labels)).toEqual(["name", "notes"]);
  });

  it("treats a cleared field as unchanged whether it's null or empty", () => {
    expect(changedFields({ notes: null }, { notes: "" }, labels)).toEqual([]);
    expect(changedFields({ notes: "" }, { notes: undefined }, labels)).toEqual([]);
    expect(changedFields({ notes: null }, { notes: "now set" }, labels)).toEqual(["notes"]);
  });

  it("compares dates and lists by content", () => {
    expect(changedFields({ issuedOn: new Date(t0) }, { issuedOn: new Date(t0) }, labels)).toEqual([]);
    expect(changedFields({ issuedOn: t0 }, { issuedOn: later(1) }, labels)).toEqual(["issue date"]);
    expect(changedFields({ tags: ["a", "b"] }, { tags: ["a", "b"] }, labels)).toEqual([]);
    expect(changedFields({ tags: ["a", "b"] }, { tags: ["b", "a"] }, labels)).toEqual(["tags"]);
  });

  it("ignores fields the update doesn't set", () => {
    expect(changedFields({ name: "A", notes: "x" }, { name: "A" }, labels)).toEqual([]);
  });

  it("builds a summary, or none when nothing changed", () => {
    const noun = describeRecord.ropa({ name: "Admissions" });
    expect(editSummary(noun, ["purpose", "retention period"])).toBe("edited the RoPA activity “Admissions” (purpose, retention period)");
    expect(editSummary(noun, [])).toBeNull();
    expect(changedFields({ owner: "Bursar" }, { owner: "Head" }, FIELD_LABELS.ropa)).toEqual(["responsible person"]);
  });

  it("names a request by its type and date, not the requester", () => {
    expect(describeRecord.request({ kind: "erasure", receivedOn: "2026-10-01" })).toMatch(/^the erasure request received /);
  });
});

describe("recordActivity", () => {
  it("copies the actor's name, which survives their account", async () => {
    await recordActivity(db, { orgId, actorId: admin, area: "dpia", summary: "approved it" }, t0);
    await db.update(users).set({ name: "Otieno O." }).where(eq(users.id, admin));
    await db.delete(users).where(eq(users.id, admin));
    const [row] = await db.select().from(activityLog);
    expect(row).toMatchObject({ actorId: null, actorName: "Otieno", summary: "approved it", createdAt: t0 });
  });

  it("saves several entries at once, and nothing for an empty list", async () => {
    await recordActivity(db, [], t0);
    await recordActivity(
      db,
      [
        { orgId, actorId: owner, area: "ropa", summary: "added one" },
        { orgId, actorId: member, area: "ropa", summary: "added two" },
      ],
      t0,
    );
    expect((await db.select({ actorName: activityLog.actorName }).from(activityLog)).map((r) => r.actorName).sort()).toEqual(["Achieng", "Wanjiku"]);
  });

  it("is undone with the transaction it's part of", async () => {
    await expect(
      db.transaction(async (tx) => {
        await recordActivity(tx, { orgId, actorId: owner, area: "team", summary: "did something" });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");
    expect(await summaries()).toEqual([]);
  });
});

describe("listActivity", () => {
  it("pages newest first without skipping entries saved at the same time", async () => {
    // Five entries share one time, then two later ones.
    await recordActivity(db, [1, 2, 3, 4, 5].map((n) => ({ orgId, actorId: owner, area: "ropa" as const, summary: `same time ${n}` })), t0);
    await recordActivity(db, { orgId, actorId: owner, area: "team", summary: "later 1" }, later(1));
    await recordActivity(db, { orgId, actorId: owner, area: "ropa", summary: "later 2" }, later(2));
    await recordActivity(db, { orgId: otherOrgId, actorId: owner, area: "ropa", summary: "another organisation" }, later(3));

    const seen: string[] = [];
    let before: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await listActivity(db, orgId, { limit: 3, before });
      seen.push(...page.rows.map((r) => r.summary));
      pages++;
      if (!page.more) break;
      before = page.rows[page.rows.length - 1].id;
    }
    expect(pages).toBe(3);
    expect(seen.slice(0, 2)).toEqual(["later 2", "later 1"]);
    expect(seen.slice(2).sort()).toEqual(["same time 1", "same time 2", "same time 3", "same time 4", "same time 5"]);
  });

  it("filters by area", async () => {
    await recordActivity(db, { orgId, actorId: owner, area: "ropa", summary: "ropa" }, t0);
    await recordActivity(db, { orgId, actorId: owner, area: "team", summary: "team" }, later(1));
    const { rows, more } = await listActivity(db, orgId, { area: "team" });
    expect(rows.map((r) => r.summary)).toEqual(["team"]);
    expect(more).toBe(false);
  });
});

describe("a record's history and links", () => {
  it("lists one record's entries, and links only records that still exist in the organisation", async () => {
    const [kept, gone] = await db
      .insert(processingActivities)
      .values([
        { orgId, name: "Admissions", purpose: "Enrol pupils", lawfulBasis: "contract", retentionPeriod: "7 years" },
        { orgId, name: "CCTV", purpose: "Security", lawfulBasis: "legitimate_interests", retentionPeriod: "30 days" },
      ])
      .returning({ id: processingActivities.id });
    await db.delete(processingActivities).where(eq(processingActivities.id, gone.id));

    await recordActivity(db, { orgId, actorId: owner, area: "ropa", subjectId: kept.id, summary: "added it" }, t0);
    await recordActivity(db, { orgId, actorId: admin, area: "ropa", subjectId: kept.id, summary: "edited it" }, later(1));
    await recordActivity(db, { orgId, actorId: owner, area: "ropa", subjectId: gone.id, summary: "deleted the other" }, later(2));
    await recordActivity(db, { orgId, actorId: owner, area: "team", subjectId: admin, summary: "changed a role" }, later(3));
    // Someone else's entry naming this record gets no link, and doesn't show in its history.
    await recordActivity(db, { orgId: otherOrgId, actorId: owner, area: "ropa", subjectId: kept.id, summary: "elsewhere" }, later(4));

    expect((await subjectHistory(db, orgId, kept.id)).map((r) => r.summary)).toEqual(["edited it", "added it"]);

    const { rows } = await listActivity(db, orgId);
    const links = await subjectLinks(db, orgId, rows);
    const bySummary = new Map(rows.map((r) => [r.summary, links.get(r.id)]));
    expect(Object.fromEntries(bySummary)).toEqual({
      "added it": `/ropa/${kept.id}`,
      "edited it": `/ropa/${kept.id}`,
      "deleted the other": undefined,
      "changed a role": undefined,
    });

    const [elsewhere] = (await listActivity(db, otherOrgId)).rows;
    expect((await subjectLinks(db, otherOrgId, [elsewhere])).size).toBe(0);
  });
});

describe("team changes", () => {
  it("logs invitations, joining, role changes and removals", async () => {
    expect(await issueInvitation(db, { orgId, actorId: owner, email: "new@sunrise.ke", role: "member" }, t0)).toHaveProperty("token");
    const resent = (await issueInvitation(db, { orgId, actorId: owner, email: "new@sunrise.ke", role: "admin" }, later(1))) as { token: string };
    expect(await issueInvitation(db, { orgId, actorId: admin, email: "later@sunrise.ke", role: "member" }, later(2))).toHaveProperty("token");
    const [pending] = await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.email, "later@sunrise.ke"));
    expect(await revokeInvitation(db, orgId, admin, pending.id, later(2.5))).toBeNull();
    expect(await createAccountFromInvitation(db, resent.token, { name: "Kamau", passwordHash: "scrypt$x" }, later(3))).not.toBeNull();

    expect(await changeMemberRole(db, { orgId, actorId: owner, userId: member, role: "admin" }, later(4))).toBeNull();
    expect(await changeMemberRole(db, { orgId, actorId: owner, userId: owner, role: "owner" }, later(5))).toBeNull(); // no change, no entry
    expect(await removeMember(db, { orgId, actorId: admin, userId: member }, later(6))).toBeNull();
    // Refused changes aren't logged.
    expect(await removeMember(db, { orgId, actorId: admin, userId: owner }, later(7))).not.toBeNull();

    const { rows } = await listActivity(db, orgId);
    expect(rows.map((r) => `${r.actorName} ${r.summary}`).reverse()).toEqual([
      "Wanjiku invited new@sunrise.ke as a member",
      "Wanjiku sent new@sunrise.ke a new invitation link, as an admin",
      "Otieno invited later@sunrise.ke as a member",
      "Otieno withdrew the invitation to later@sunrise.ke",
      "Kamau joined the team as an admin",
      "Wanjiku changed Achieng's role from member to admin",
      "Otieno removed Achieng from the team",
    ]);
    expect(rows.every((r) => r.area === "team")).toBe(true);
  });
});

describe("accounts and organisations", () => {
  it("logs a deleted account under the name it had", async () => {
    expect(await deleteAccount(db, member)).toBeNull();
    const [row] = await db.select().from(activityLog);
    expect(row).toMatchObject({ orgId, actorId: null, actorName: "Achieng", area: "team", summary: "deleted their account and left the team" });
  });

  it("includes the log in the export, and deletes it with the organisation", async () => {
    await recordActivity(db, { orgId, actorId: owner, area: "organization", summary: "edited the organisation's settings (name)" }, t0);
    await recordActivity(db, { orgId: otherOrgId, actorId: owner, area: "ropa", summary: "not ours" }, t0);

    const data = await exportOrganization(db, orgId, later(1));
    expect(data?.activityLog).toEqual([
      { actorId: owner, actorName: "Wanjiku", area: "organization", subjectId: null, summary: "edited the organisation's settings (name)", createdAt: t0 },
    ]);

    expect(await deleteOrganization(db, { orgId, actorId: owner }, later(2))).not.toHaveProperty("error");
    expect(await summaries()).toEqual(["not ours"]);
  });
});
