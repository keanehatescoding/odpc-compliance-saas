import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { safeNextPath } from "@/lib/next-path";
import { assignableRoles, canManage } from "@/lib/roles";
import {
  acceptInvitation,
  changeMemberRole,
  createAccountFromInvitation,
  findInvitation,
  INVITE_TTL_MS,
  invitationEmail,
  issueInvitation,
  pendingInvitations,
  pruneInvitations,
  removeMember,
  revokeInvitation,
  teamMembers,
} from "@/lib/team";

const { invitations, memberships, organizations, users } = schema;

let db: Db;
let orgId: string;
let owner: string;
let admin: string;
let member: string;

const t0 = new Date("2026-10-05T09:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

async function addUser(email: string, verified = true): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email, name: email.split("@")[0], passwordHash: "x", emailVerifiedAt: verified ? t0 : null })
    .returning({ id: users.id });
  return u.id;
}

async function addOrg(name: string): Promise<string> {
  const [o] = await db.insert(organizations).values({ name, sector: "education", size: "micro_small" }).returning({ id: organizations.id });
  return o.id;
}

async function roleOf(userId: string) {
  const [m] = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  return m?.role ?? null;
}

async function invite(email: string, role: schema.MemberRole = "member", actorId = owner, now = t0) {
  const r = await issueInvitation(db, { orgId, actorId, email, role }, now);
  if ("error" in r) throw new Error(r.error);
  return r.token;
}

beforeEach(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  db = pg as unknown as Db;

  orgId = await addOrg("Sunrise Academy");
  owner = await addUser("owner@sunrise.ke");
  admin = await addUser("admin@sunrise.ke");
  member = await addUser("member@sunrise.ke");
  await db.insert(memberships).values([
    { orgId, userId: owner, role: "owner" },
    { orgId, userId: admin, role: "admin" },
    { orgId, userId: member, role: "member" },
  ]);
});

describe("role rules", () => {
  it("lets owners hand out any role, admins up to admin, and members none", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "admin", "member"]);
    expect(assignableRoles("admin")).toEqual(["admin", "member"]);
    expect(assignableRoles("member")).toEqual([]);
    expect(canManage("admin", "owner")).toBe(false);
    expect(canManage("admin", "admin")).toBe(true);
    expect(canManage("member", "member")).toBe(false);
  });
});

describe("issueInvitation", () => {
  it("creates an invitation that can be looked up by its token until it expires", async () => {
    const token = await invite("new@sunrise.ke", "admin");
    expect(await findInvitation(db, token, t0)).toMatchObject({
      email: "new@sunrise.ke",
      role: "admin",
      orgId,
      orgName: "Sunrise Academy",
      invitedBy: "owner",
    });
    expect(await findInvitation(db, token, later(INVITE_TTL_MS))).toBeNull();
    expect(await findInvitation(db, "not-a-token", t0)).toBeNull();
  });

  it("replaces an earlier invitation to the same address, whatever its case", async () => {
    const first = await invite("new@sunrise.ke");
    const second = await invite("NEW@sunrise.ke", "admin");
    expect(await findInvitation(db, first, t0)).toBeNull();
    expect(await findInvitation(db, second, t0)).toMatchObject({ role: "admin" });
    expect(await pendingInvitations(db, orgId)).toHaveLength(1);
  });

  it("refuses people already on the team", async () => {
    const r = await issueInvitation(db, { orgId, actorId: owner, email: "Member@Sunrise.ke", role: "member" }, t0);
    expect(r).toEqual({ error: "Member@Sunrise.ke is already on the team." });
  });

  it("only lets people invite roles they can manage", async () => {
    expect(await issueInvitation(db, { orgId, actorId: admin, email: "x@y.ke", role: "owner" }, t0)).toHaveProperty("error");
    expect(await issueInvitation(db, { orgId, actorId: member, email: "x@y.ke", role: "member" }, t0)).toHaveProperty("error");
    expect(await issueInvitation(db, { orgId, actorId: admin, email: "x@y.ke", role: "admin" }, t0)).toHaveProperty("token");
    const outsider = await addUser("outsider@other.ke");
    expect(await issueInvitation(db, { orgId, actorId: outsider, email: "x@y.ke", role: "member" }, t0)).toHaveProperty("error");
  });

  it("doesn't let an admin overwrite an owner's invitation", async () => {
    const token = await invite("boss@sunrise.ke", "owner");
    const r = await issueInvitation(db, { orgId, actorId: admin, email: "boss@sunrise.ke", role: "member" }, t0);
    expect(r).toHaveProperty("error");
    expect(await findInvitation(db, token, t0)).toMatchObject({ role: "owner" });
  });
});

describe("acceptInvitation", () => {
  it("adds the user with the invited role, uses up the link and confirms their email", async () => {
    const token = await invite("new@sunrise.ke", "admin");
    const userId = await addUser("New@Sunrise.ke", false);
    expect(await acceptInvitation(db, token, userId, later(DAY))).toEqual({ orgId });
    expect(await roleOf(userId)).toBe("admin");
    expect(await pendingInvitations(db, orgId)).toEqual([]);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.emailVerifiedAt).toEqual(later(DAY));

    expect(await acceptInvitation(db, token, userId, later(DAY))).toEqual({ error: "invalid" });
  });

  it("refuses a user with a different address and keeps the invitation", async () => {
    const token = await invite("new@sunrise.ke");
    const other = await addUser("someone@else.ke");
    expect(await acceptInvitation(db, token, other, t0)).toEqual({ error: "wrong_email" });
    expect(await findInvitation(db, token, t0)).not.toBeNull();
  });

  it("refuses a user who already belongs to an organisation", async () => {
    const token = await invite("busy@other.ke");
    const busy = await addUser("busy@other.ke");
    await db.insert(memberships).values({ orgId: await addOrg("Other Clinic"), userId: busy, role: "owner" });
    expect(await acceptInvitation(db, token, busy, t0)).toEqual({ error: "has_org" });
    expect(await roleOf(busy)).toBeNull();
  });

  it("refuses an expired invitation", async () => {
    const token = await invite("new@sunrise.ke");
    const userId = await addUser("new@sunrise.ke");
    expect(await acceptInvitation(db, token, userId, later(INVITE_TTL_MS))).toEqual({ error: "invalid" });
  });
});

describe("createAccountFromInvitation", () => {
  it("creates a confirmed account on the team and uses up the link", async () => {
    const token = await invite("new@sunrise.ke");
    const userId = await createAccountFromInvitation(db, token, { name: "Wanjiru", passwordHash: "h" }, later(DAY));
    expect(userId).toBeTruthy();
    const [u] = await db.select().from(users).where(eq(users.id, userId!));
    expect(u).toMatchObject({ email: "new@sunrise.ke", name: "Wanjiru", emailVerifiedAt: later(DAY) });
    expect(await roleOf(userId!)).toBe("member");

    expect(await createAccountFromInvitation(db, token, { name: "Again", passwordHash: "h" }, later(DAY))).toBeNull();
  });

  it("throws on an existing account and leaves the invitation usable", async () => {
    const token = await invite("new@sunrise.ke");
    await addUser("NEW@sunrise.ke");
    const err = await createAccountFromInvitation(db, token, { name: "X", passwordHash: "h" }, t0).catch((e) => e);
    expect(isUniqueViolation(err)).toBe(true);
    expect(await findInvitation(db, token, t0)).not.toBeNull();
  });

  it("refuses an expired invitation", async () => {
    const token = await invite("new@sunrise.ke");
    expect(await createAccountFromInvitation(db, token, { name: "X", passwordHash: "h" }, later(INVITE_TTL_MS))).toBeNull();
  });
});

describe("revokeInvitation", () => {
  it("withdraws an invitation the actor can manage", async () => {
    await invite("new@sunrise.ke");
    const [i] = await pendingInvitations(db, orgId);
    expect(await revokeInvitation(db, orgId, admin, i.id)).toBeNull();
    expect(await pendingInvitations(db, orgId)).toEqual([]);
  });

  it("keeps owner invitations away from admins and all invitations away from members", async () => {
    await invite("boss@sunrise.ke", "owner");
    await invite("new@sunrise.ke", "member");
    const pending = await pendingInvitations(db, orgId);
    const boss = pending.find((i) => i.role === "owner")!;
    const other = pending.find((i) => i.role === "member")!;
    expect(await revokeInvitation(db, orgId, admin, boss.id)).toBeTruthy();
    expect(await revokeInvitation(db, orgId, member, other.id)).toBeTruthy();
    expect(await pendingInvitations(db, orgId)).toHaveLength(2);
  });

  it("ignores invitations from other organisations", async () => {
    const elsewhere = await addOrg("Other Clinic");
    const [i] = await db
      .insert(invitations)
      .values({ tokenHash: "h", orgId: elsewhere, email: "a@b.ke", role: "member", expiresAt: later(DAY) })
      .returning();
    expect(await revokeInvitation(db, orgId, owner, i.id)).toBeNull();
    expect(await pendingInvitations(db, elsewhere)).toHaveLength(1);
  });
});

describe("changeMemberRole", () => {
  it("lets owners change any role", async () => {
    expect(await changeMemberRole(db, { orgId, actorId: owner, userId: member, role: "owner" })).toBeNull();
    expect(await roleOf(member)).toBe("owner");
  });

  it("stops admins touching owners or making owners", async () => {
    expect(await changeMemberRole(db, { orgId, actorId: admin, userId: member, role: "owner" })).toBeTruthy();
    expect(await changeMemberRole(db, { orgId, actorId: admin, userId: owner, role: "member" })).toBeTruthy();
    expect(await changeMemberRole(db, { orgId, actorId: admin, userId: member, role: "admin" })).toBeNull();
    expect(await roleOf(member)).toBe("admin");
    expect(await roleOf(owner)).toBe("owner");
  });

  it("stops members changing anyone", async () => {
    expect(await changeMemberRole(db, { orgId, actorId: member, userId: admin, role: "member" })).toBeTruthy();
    expect(await roleOf(admin)).toBe("admin");
  });

  it("keeps at least one owner", async () => {
    const r = await changeMemberRole(db, { orgId, actorId: owner, userId: owner, role: "admin" });
    expect(r).toBe("Every organisation needs an owner. Make someone else an owner first.");
    expect(await roleOf(owner)).toBe("owner");

    await changeMemberRole(db, { orgId, actorId: owner, userId: admin, role: "owner" });
    expect(await changeMemberRole(db, { orgId, actorId: owner, userId: owner, role: "admin" })).toBeNull();
    expect(await roleOf(owner)).toBe("admin");
  });

  it("can't demote both of two owners at once", async () => {
    await changeMemberRole(db, { orgId, actorId: owner, userId: admin, role: "owner" });
    const results = await Promise.all([
      changeMemberRole(db, { orgId, actorId: owner, userId: admin, role: "member" }),
      changeMemberRole(db, { orgId, actorId: admin, userId: owner, role: "member" }),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    const roles = (await teamMembers(db, orgId)).map((m) => m.role);
    expect(roles.filter((r) => r === "owner")).toHaveLength(1);
  });
});

describe("removeMember", () => {
  it("removes someone the actor can manage", async () => {
    expect(await removeMember(db, { orgId, actorId: admin, userId: member })).toBeNull();
    expect(await roleOf(member)).toBeNull();
  });

  it("refuses removing yourself, or an owner unless you're an owner", async () => {
    expect(await removeMember(db, { orgId, actorId: owner, userId: owner })).toBeTruthy();
    expect(await removeMember(db, { orgId, actorId: admin, userId: owner })).toBeTruthy();
    expect(await removeMember(db, { orgId, actorId: member, userId: admin })).toBeTruthy();
    expect(await teamMembers(db, orgId)).toHaveLength(3);
  });
});

describe("pruneInvitations", () => {
  it("keeps expired invitations for 30 days so they can be resent", async () => {
    await invite("new@sunrise.ke");
    await pruneInvitations(db, later(INVITE_TTL_MS + 29 * DAY));
    expect(await pendingInvitations(db, orgId)).toHaveLength(1);
    await pruneInvitations(db, later(INVITE_TTL_MS + 30 * DAY));
    expect(await pendingInvitations(db, orgId)).toEqual([]);
  });
});

describe("invitationEmail", () => {
  it("names the organisation, inviter and role, and links to the invitation", () => {
    const m = invitationEmail("new@sunrise.ke", {
      orgName: "Sunrise Academy",
      inviterName: "Achieng",
      role: "admin",
      link: "https://app/invite?token=abc",
    });
    expect(m.to).toEqual(["new@sunrise.ke"]);
    expect(m.subject).toBe("Achieng invited you to Sunrise Academy on Kinga");
    expect(m.text).toContain("as an admin.");
    expect(m.text).toContain("https://app/invite?token=abc");
    expect(m.text).toContain("expires in 7 days");
  });
});

describe("safeNextPath", () => {
  it("allows plain paths on this site", () => {
    expect(safeNextPath("/invite?token=abc-_123%3D")).toBe("/invite?token=abc-_123%3D");
    expect(safeNextPath("/requests/new")).toBe("/requests/new");
  });

  it("falls back to the dashboard for anything that could leave the site", () => {
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "evil", " /x"]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
