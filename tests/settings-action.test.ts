import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

// The action reads the app's db and session; point them at an in-memory database and a fixed signed-in owner.
const ctx = vi.hoisted(() => ({ db: undefined as unknown as Db, user: { id: "" }, org: { id: "" }, role: "owner" as "owner" | "admin" | "member" }));
vi.mock("@/db", () => ({ get db() { return ctx.db; } }));
vi.mock("@/lib/session", () => ({ requireOrgContext: async () => ({ user: ctx.user, org: ctx.org, role: ctx.role }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateOrganization } = await import("@/app/actions/settings");
const { organizations, users } = schema;

function form(name = "Sunrise Academy"): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({ name, sector: "education", size: "micro_small", kraPin: "", reminderEmail: "", privacyContact: "", privacyEmail: "", privacyPhone: "", address: "", dpoDesignated: "", dpoName: "", dpoEmail: "", dpoPhone: "", dpoAppointedOn: "", dpoNotifiedOn: "" })) {
    f.set(k, v);
  }
  return f;
}

beforeEach(async () => {
  const pg = drizzle({ client: new PGlite(), schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  ctx.db = pg as unknown as Db;
  const [u] = await ctx.db.insert(users).values({ email: "owner@sunrise.ke", name: "owner", passwordHash: "scrypt$x" }).returning({ id: users.id });
  const [o] = await ctx.db.insert(organizations).values({ name: "Sunrise", sector: "education", size: "micro_small" }).returning({ id: organizations.id });
  ctx.user = { id: u.id };
  ctx.org = { id: o.id };
  ctx.role = "owner";
});

describe("updateOrganization", () => {
  it("saves the settings", async () => {
    expect(await updateOrganization(undefined, form("Sunrise Academy"))).toMatchObject({ message: "Saved." });
    const [row] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.org.id));
    expect(row.name).toBe("Sunrise Academy");
  });

  it("says the organisation is gone when its row was removed after sign-in", async () => {
    ctx.org = { id: randomUUID() };
    expect(await updateOrganization(undefined, form())).toMatchObject({ message: "This organisation has been deleted." });
  });

  it("doesn't write to an organisation deleted after sign-in", async () => {
    await ctx.db.update(organizations).set({ deletedAt: new Date() }).where(eq(organizations.id, ctx.org.id));
    expect(await updateOrganization(undefined, form("Put Back"))).toMatchObject({ message: "This organisation has been deleted." });
    const [row] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.org.id));
    expect(row.name).toBe("Sunrise");
  });
});
