import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { daysToReview, processorGaps, processorStatus, type ProcessorGapInput } from "@/lib/processor";
import { parseProcessorForm } from "@/lib/processor-form";

const { activityLog, organizations, processingActivities, processorActivities, processors, users } = schema;

const today = "2026-10-10";

describe("contract status", () => {
  it("has no contract until one is signed", () => {
    expect(processorStatus({ contractSignedOn: null, contractReviewOn: null }, today)).toBe("no_contract");
    expect(processorStatus({ contractSignedOn: "2026-01-15", contractReviewOn: null }, today)).toBe("in_place");
  });

  it("is due for review from the review date", () => {
    const p = { contractSignedOn: "2025-10-10", contractReviewOn: "2026-10-10" };
    expect(processorStatus(p, "2026-10-09")).toBe("in_place");
    expect(processorStatus(p, "2026-10-10")).toBe("review_due");
    expect(processorStatus(p, "2026-11-01")).toBe("review_due");
    expect(daysToReview(p, "2026-10-03")).toBe(7);
    expect(daysToReview(p, "2026-10-12")).toBe(-2);
  });

  it("counts no days to a review that isn't set", () => {
    expect(daysToReview({ contractSignedOn: "2026-01-15", contractReviewOn: null }, today)).toBeNull();
  });
});

describe("processorGaps", () => {
  const complete: ProcessorGapInput = {
    contractSignedOn: "2026-01-15",
    guarantees: "ODPC processor certificate seen",
    location: "Kenya",
    outsideKenya: false,
  };
  const fees = { name: "Fees", crossBorder: false };

  it("finds nothing missing from a complete record", () => {
    expect(processorGaps(complete, [fees])).toEqual([]);
  });

  it("asks for the contract, the security check and the activities", () => {
    const gaps = processorGaps({ ...complete, contractSignedOn: null, guarantees: "" }, []);
    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toContain("written contract");
    expect(gaps[1]).toContain("secure");
    expect(gaps[2]).toContain("processing activities");
  });

  it("names linked activities that don't record the transfer outside Kenya", () => {
    const abroad = { ...complete, outsideKenya: true, location: "Ireland" };
    expect(processorGaps(abroad, [fees, { name: "Payroll", crossBorder: true }])).toEqual([
      "They hold data outside Kenya, but your RoPA doesn't record a transfer for: Fees.",
    ]);
    expect(processorGaps(abroad, [{ name: "Payroll", crossBorder: true }])).toEqual([]);
    expect(processorGaps({ ...abroad, location: "" }, [{ name: "Payroll", crossBorder: true }])).toEqual([
      "Say which country they hold the data in.",
    ]);
  });
});

describe("parseProcessorForm", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { name: "Elimu Systems", service: "Hosts the school system", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const r = parseProcessorForm(fd, today);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("accepts a processor with nothing but a name and what it does", () => {
    const r = parseProcessorForm(form(), today);
    expect(r.success && r.data).toMatchObject({
      name: "Elimu Systems",
      outsideKenya: false,
      contractSignedOn: null,
      contractReviewOn: null,
      guarantees: "",
    });
  });

  it("reads the contract dates and the outside-Kenya tick", () => {
    const r = parseProcessorForm(form({ outsideKenya: "on", contractSignedOn: "2026-01-15", contractReviewOn: "2027-01-15" }), today);
    expect(r.success && r.data).toMatchObject({ outsideKenya: true, contractSignedOn: "2026-01-15", contractReviewOn: "2027-01-15" });
  });

  it("needs a name and a service", () => {
    expect(Object.keys(errors(form({ name: "", service: "" }))).sort()).toEqual(["name", "service"]);
  });

  it("rejects a contract signed in the future, or reviewed before it was signed", () => {
    expect(errors(form({ contractSignedOn: "2026-10-11" }))).toHaveProperty("contractSignedOn");
    expect(errors(form({ contractSignedOn: "2026-01-15", contractReviewOn: "2026-01-14" }))).toHaveProperty("contractReviewOn");
    expect(errors(form({ contractSignedOn: "not a date" }))).toHaveProperty("contractSignedOn");
  });

  it("won't take a review date without a signed contract", () => {
    expect(errors(form({ contractReviewOn: "2027-01-15" }))).toEqual({ contractReviewOn: "Enter the date the contract was signed first." });
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let activityId: string;
  let processorId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId, name: "Fees", purpose: "Collect fees", lawfulBasis: "contract", retentionPeriod: "7 years" })
      .returning();
    activityId = activity.id;
    const [processor] = await db.insert(processors).values({ orgId, name: "Elimu Systems", service: "Hosts the school system" }).returning();
    processorId = processor.id;
    await db.insert(processorActivities).values({ processorId, activityId });
  });

  it("drops the link, not the processor, when an activity is deleted", async () => {
    await db.delete(processingActivities).where(eq(processingActivities.id, activityId));
    expect(await db.select().from(processorActivities)).toEqual([]);
    expect(await db.select().from(processors)).toHaveLength(1);
  });

  it("drops the link, not the activity, when a processor is deleted", async () => {
    await db.delete(processors).where(eq(processors.id, processorId));
    expect(await db.select().from(processorActivities)).toEqual([]);
    expect(await db.select().from(processingActivities)).toHaveLength(1);
  });

  it("logs changes under their own area and links entries to the processor while it exists", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(processors).where(eq(processors.id, processorId));
    const fields = changedFields(
      { ...before, activityIds: [activityId] },
      { ...before, contractRef: "Signed DPA", activityIds: [] },
      FIELD_LABELS.processor,
    );
    expect(fields).toEqual(["processing activities", "contract reference"]);

    await recordActivity(db, { orgId, actorId: user.id, area: "processor", subjectId: processorId, summary: `added ${describeRecord.processor(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "processor", summary: "added the processor “Elimu Systems”" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/processors/${processorId}`);

    await db.delete(processors).where(eq(processors.id, processorId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
