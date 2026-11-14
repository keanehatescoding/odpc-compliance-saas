import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { deleteOrganization } from "@/lib/account";
import { todayInKenya } from "@/lib/dates";
import { dpoIssues } from "@/lib/dpo";
import { openTestDb } from "./helpers/db";

// The action reads the app's db and session; point them at an in-memory database and a fixed signed-in owner.
const ctx = vi.hoisted(() => ({ db: undefined as unknown as Db, user: { id: "" }, org: { id: "" }, role: "owner" as "owner" | "admin" | "member" }));
vi.mock("@/db", () => ({ get db() { return ctx.db; } }));
vi.mock("@/lib/session", () => ({ requireOrgContext: async () => ({ user: ctx.user, org: ctx.org, role: ctx.role }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateOrganization } = await import("@/app/actions/settings");
const { memberships, organizations, users } = schema;

// An organisation that reported its officer before these tests begin.
const saved = {
  name: "Sunrise",
  sector: "education",
  size: "micro_small",
  dpoDesignated: true,
  dpoName: "Achieng Otieno",
  dpoEmail: "dpo@sunrise.ke",
  dpoPhone: "+254 700 000 001",
  dpoAppointedOn: "2026-01-05",
  dpoNotifiedOn: "2026-01-20",
  dpoDetailsChangedOn: "2026-01-12",
} as const;

/** The settings form as the page would submit it for the saved organisation, with some fields changed. */
function form(changes: Record<string, string> = {}): FormData {
  const f = new FormData();
  const fields = {
    name: saved.name,
    sector: saved.sector,
    size: saved.size,
    kraPin: "",
    reminderEmail: "",
    privacyContact: "",
    privacyEmail: "",
    privacyPhone: "",
    address: "",
    dpoDesignated: "yes",
    dpoName: saved.dpoName,
    dpoEmail: saved.dpoEmail,
    dpoPhone: saved.dpoPhone,
    dpoAppointedOn: saved.dpoAppointedOn,
    dpoNotifiedOn: saved.dpoNotifiedOn,
    ...changes,
  };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function stored() {
  const [row] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.org.id));
  return row;
}

beforeEach(async () => {
  ctx.db = await openTestDb();
  const [u] = await ctx.db.insert(users).values({ email: "owner@sunrise.ke", name: "owner", passwordHash: "scrypt$x" }).returning({ id: users.id });
  const [o] = await ctx.db.insert(organizations).values(saved).returning({ id: organizations.id });
  await ctx.db.insert(memberships).values({ orgId: o.id, userId: u.id, role: "owner" });
  ctx.user = { id: u.id };
  ctx.org = { id: o.id };
  ctx.role = "owner";
});

describe("updateOrganization", () => {
  it("saves the settings, including the officer's details", async () => {
    const r = await updateOrganization(undefined, form({ name: "Sunrise Academy", dpoName: "Wanjiru Kamau", dpoEmail: "wanjiru@sunrise.ke", dpoPhone: "+254 700 000 002" }));
    expect(r).toMatchObject({ message: "Saved." });
    expect(await stored()).toMatchObject({
      name: "Sunrise Academy",
      dpoDesignated: true,
      dpoName: "Wanjiru Kamau",
      dpoEmail: "wanjiru@sunrise.ke",
      dpoPhone: "+254 700 000 002",
    });
  });

  it("dates a change to reported details today, so it shows as not yet sent", async () => {
    await updateOrganization(undefined, form({ dpoEmail: "new@sunrise.ke" }));
    const row = await stored();
    expect(row.dpoDetailsChangedOn).toBe(todayInKenya());
    expect(dpoIssues(row)).toEqual([{ kind: "changed_since_notified", changedOn: todayInKenya(), notifiedOn: saved.dpoNotifiedOn }]);
  });

  it("saves edits to both dates without dating a change to the details", async () => {
    // Sent before the recorded change, so the change now shows as not yet sent.
    await updateOrganization(undefined, form({ dpoAppointedOn: "2026-01-02", dpoNotifiedOn: "2026-01-10" }));
    const row = await stored();
    expect(row).toMatchObject({ dpoAppointedOn: "2026-01-02", dpoNotifiedOn: "2026-01-10", dpoDetailsChangedOn: saved.dpoDetailsChangedOn });
    expect(dpoIssues(row)).toEqual([{ kind: "changed_since_notified", changedOn: saved.dpoDetailsChangedOn, notifiedOn: "2026-01-10" }]);
  });

  it("records that the organisation has no officer, leaving nothing to follow up", async () => {
    const r = await updateOrganization(
      undefined,
      form({ dpoDesignated: "no", dpoName: "", dpoEmail: "", dpoPhone: "", dpoAppointedOn: "", dpoNotifiedOn: "" }),
    );
    expect(r).toMatchObject({ message: "Saved." });
    const row = await stored();
    expect(row).toMatchObject({ dpoDesignated: false, dpoName: null, dpoEmail: null, dpoPhone: null, dpoAppointedOn: null, dpoNotifiedOn: null });
    expect(dpoIssues(row)).toEqual([]);
  });

  it("keeps the change date when only other settings change", async () => {
    await updateOrganization(undefined, form({ address: "Kisumu" }));
    expect((await stored()).dpoDetailsChangedOn).toBe(saved.dpoDetailsChangedOn);
  });

  it("says the organisation is gone when its row was removed after sign-in", async () => {
    ctx.org = { id: randomUUID() };
    expect(await updateOrganization(undefined, form())).toMatchObject({ message: "This organisation has been deleted." });
  });

  it("doesn't put back details erased when the organisation was deleted", async () => {
    expect(await deleteOrganization(ctx.db, { orgId: ctx.org.id, actorId: ctx.user.id })).not.toHaveProperty("error");
    const erased = await stored();
    expect(erased).toMatchObject({ dpoName: null, dpoEmail: null, dpoPhone: null });

    // A save from a page loaded before the deletion, carrying the old details.
    expect(await updateOrganization(undefined, form({ name: "Put Back" }))).toMatchObject({ message: "This organisation has been deleted." });
    expect(await stored()).toEqual(erased);
  });
});
