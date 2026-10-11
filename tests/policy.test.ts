import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { daysToPolicyReview, missingKinds, policyGaps, policyStatus } from "@/lib/policy";
import { parsePolicyForm } from "@/lib/policy-form";

const { activityLog, organizations, policies, users } = schema;

const today = "2026-10-10";

describe("policy status", () => {
  const approved = { approvedOn: "2025-10-10", reviewOn: "2026-10-10" };

  it("is a draft until it is approved, whatever its review date", () => {
    expect(policyStatus({ approvedOn: null, reviewOn: null }, today)).toBe("draft");
    expect(policyStatus({ approvedOn: null, reviewOn: "2026-01-01" }, today)).toBe("draft");
    expect(daysToPolicyReview({ approvedOn: null, reviewOn: "2026-10-17" }, today)).toBeNull();
  });

  it("is due for review from its review date", () => {
    expect(policyStatus(approved, "2026-10-09")).toBe("in_place");
    expect(policyStatus(approved, "2026-10-10")).toBe("review_due");
    expect(daysToPolicyReview(approved, "2026-10-03")).toBe(7);
    expect(daysToPolicyReview(approved, "2026-10-12")).toBe(-2);
  });

  it("is never due when no review is set", () => {
    const open = { approvedOn: "2020-01-01", reviewOn: null };
    expect(policyStatus(open, "2030-01-01")).toBe("in_place");
    expect(daysToPolicyReview(open, today)).toBeNull();
  });
});

describe("missingKinds", () => {
  it("lists the named kinds with nothing on record, and never the catch-all", () => {
    expect(missingKinds([])).toEqual(["data_protection", "retention", "breach", "requests", "security"]);
    expect(missingKinds([{ kind: "breach" }, { kind: "data_protection" }, { kind: "other" }])).toEqual(["retention", "requests", "security"]);
  });
});

describe("policyGaps", () => {
  const complete = {
    approvedOn: "2026-02-01",
    approvedBy: "The board",
    reviewOn: "2027-02-01",
    owner: "The bursar",
    location: "Shared drive",
    communicated: "Staff meeting",
  };

  it("finds nothing missing from a complete record", () => {
    expect(policyGaps(complete)).toEqual([]);
  });

  it("asks a draft for everything but a review date", () => {
    const gaps = policyGaps({ approvedOn: null, approvedBy: "", reviewOn: null, owner: "", location: "", communicated: "" });
    expect(gaps).toHaveLength(5);
    expect(gaps[0]).toContain("approved");
    expect(gaps.join(" ")).not.toContain("review it");
  });

  it("asks an approved policy for a review date", () => {
    expect(policyGaps({ ...complete, reviewOn: null })).toEqual(["Set a date to review it."]);
  });
});

describe("parsePolicyForm", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { title: "Data Protection Policy", kind: "data_protection", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const parsed = parsePolicyForm(fd, today);
    return parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("accepts a draft with only a title and a kind", () => {
    const parsed = parsePolicyForm(form(), today);
    expect(parsed.success && parsed.data).toEqual({
      title: "Data Protection Policy",
      kind: "data_protection",
      version: "",
      owner: "",
      approvedBy: "",
      approvedOn: null,
      reviewOn: null,
      location: "",
      communicated: "",
      notes: "",
    });
  });

  it("reads the optional fields", () => {
    const parsed = parsePolicyForm(form({ version: " 2.1 ", approvedOn: "2026-02-01", reviewOn: "2027-02-01", approvedBy: "The board" }), today);
    expect(parsed.success && parsed.data).toMatchObject({ version: "2.1", approvedOn: "2026-02-01", reviewOn: "2027-02-01", approvedBy: "The board" });
  });

  it("needs a title and a kind it knows", () => {
    expect(Object.keys(errors(new FormData())).sort()).toEqual(["kind", "title"]);
    expect(errors(form({ kind: "dress_code" })).kind).toBe("Choose what kind of document it is.");
  });

  it("only records an approval that has happened", () => {
    expect(errors(form({ approvedOn: today }))).toEqual({});
    expect(errors(form({ approvedOn: "2026-10-11" })).approvedOn).toContain("future");
    expect(errors(form({ approvedOn: "2026-02-30" })).approvedOn).toBe("Enter a valid date.");
  });

  it("puts the review after the approval, and lets a draft plan one", () => {
    expect(errors(form({ approvedOn: "2026-02-01", reviewOn: "2026-02-01" })).reviewOn).toBe("This must be after the approval.");
    expect(errors(form({ approvedOn: "2026-02-01", reviewOn: "2026-02-02" }))).toEqual({});
    expect(errors(form({ reviewOn: "2027-01-01" }))).toEqual({});
    expect(errors(form({ reviewOn: "soon" })).reviewOn).toBe("Enter a valid date.");
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let policyId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const [policy] = await db.insert(policies).values({ orgId, title: "Data Protection Policy", kind: "data_protection" }).returning();
    policyId = policy.id;
  });

  it("starts as a draft with the optional fields empty", async () => {
    const [row] = await db.select().from(policies);
    expect(row).toMatchObject({ approvedOn: null, reviewOn: null, version: "", owner: "", approvedBy: "", location: "", communicated: "", notes: "" });
  });

  it("goes with its organisation", async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    expect(await db.select().from(policies)).toEqual([]);
  });

  it("only stores a kind it knows", async () => {
    await expect(db.update(policies).set({ kind: "dress_code" }).where(eq(policies.id, policyId))).rejects.toThrow();
  });

  it("logs changes under their own area, by title", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(policies).where(eq(policies.id, policyId));
    expect(changedFields(before, { ...before, approvedOn: "2026-02-01", approvedBy: "The board" }, FIELD_LABELS.policy)).toEqual([
      "who approved it",
      "approval date",
    ]);

    await recordActivity(db, { orgId, actorId: user.id, area: "policy", subjectId: policyId, summary: `added ${describeRecord.policy(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "policy", summary: "added the policy “Data Protection Policy”" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/policies/${policyId}`);

    await db.delete(policies).where(eq(policies.id, policyId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
