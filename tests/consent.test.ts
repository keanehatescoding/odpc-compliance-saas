import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { activitiesWithoutConsent, consentGaps, consentStatus, daysToConsentReview } from "@/lib/consent";
import { parseConsentForm } from "@/lib/consent-form";

const { activityLog, consentRecords, organizations, processingActivities, users } = schema;

const today = "2026-10-10";

describe("consent status", () => {
  const complete = { wording: "I agree to receive offers by SMS.", evidence: "Opt-in log", withdrawal: "Reply STOP", reviewOn: "2026-10-10" };

  it("can't prove consent without the wording, the proof and a way to withdraw", () => {
    for (const missing of ["wording", "evidence", "withdrawal"] as const) {
      expect(consentStatus({ ...complete, [missing]: "" }, "2026-01-01")).toBe("incomplete");
    }
  });

  it("is due for review from the review date", () => {
    expect(consentStatus(complete, "2026-10-09")).toBe("in_place");
    expect(consentStatus(complete, "2026-10-10")).toBe("review_due");
    expect(daysToConsentReview(complete, "2026-10-03")).toBe(7);
    expect(daysToConsentReview(complete, "2026-10-12")).toBe(-2);
  });

  it("is never due when no review is planned", () => {
    const open = { ...complete, reviewOn: null };
    expect(consentStatus(open, "2030-01-01")).toBe("in_place");
    expect(daysToConsentReview(open, today)).toBeNull();
  });
});

describe("consentGaps", () => {
  const complete = { wording: "I agree.", evidence: "Signed forms", withdrawal: "Tell the office", parental: false, guardianCheck: "", conditional: false };
  const marketing = { name: "Marketing messages", lawfulBasis: "consent", involvesChildren: false };

  it("finds nothing missing from a complete record", () => {
    expect(consentGaps(complete, marketing)).toEqual([]);
  });

  it("asks for the wording, the proof, a way to withdraw and an activity", () => {
    const gaps = consentGaps({ ...complete, wording: "", evidence: "", withdrawal: "" }, null);
    expect(gaps).toHaveLength(4);
    expect(gaps[0]).toContain("exact wording");
    expect(gaps[1]).toContain("burden of proving");
    expect(gaps[2]).toContain("withdraws");
    expect(gaps[3]).toContain("Link the processing activity");
  });

  it("notices an activity whose lawful basis isn't consent", () => {
    const [gap] = consentGaps(complete, { ...marketing, name: "Payroll", lawfulBasis: "contract" });
    expect(gap).toContain("“Performance of a contract with the data subject” as the lawful basis for Payroll");
  });

  it("wants a parent's or guardian's consent where children are involved, and how they are verified", () => {
    const photos = { ...marketing, name: "Pupil photographs", involvesChildren: true };
    expect(consentGaps(complete, photos)).toEqual([expect.stringContaining("Section 33")]);
    expect(consentGaps({ ...complete, parental: true }, photos)).toEqual([expect.stringContaining("parent or guardian")]);
    expect(consentGaps({ ...complete, parental: true, guardianCheck: "Matched to the admission record" }, photos)).toEqual([]);
  });

  it("warns when the service depends on agreeing", () => {
    expect(consentGaps({ ...complete, conditional: true }, marketing)).toEqual([expect.stringContaining("section 32(4)")]);
  });
});

describe("activitiesWithoutConsent", () => {
  const activities = [
    { id: "a1", name: "Marketing", lawfulBasis: "consent", role: "controller" },
    { id: "a2", name: "Payroll", lawfulBasis: "contract", role: "controller" },
    { id: "a3", name: "Loyalty", lawfulBasis: "consent", role: null },
    { id: "a4", name: "Client campaigns", lawfulBasis: "consent", role: "processor" },
  ];

  it("lists what relies on consent with no record, leaving out what is processed for someone else", () => {
    expect(activitiesWithoutConsent(activities, []).map((a) => a.name)).toEqual(["Marketing", "Loyalty"]);
    expect(activitiesWithoutConsent(activities, [{ activityId: "a1" }, { activityId: null }]).map((a) => a.name)).toEqual(["Loyalty"]);
  });
});

describe("parseConsentForm", () => {
  const activityId = "7b0e7a52-5d0c-4a44-9f0e-1c2d3e4f5a6b";
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { name: "Marketing SMS", activityId, method: "sms", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const r = parseConsentForm(fd, today);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("accepts a record with only a name, an activity and a method", () => {
    const r = parseConsentForm(form(), today);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ name: "Marketing SMS", activityId, method: "sms", wording: "", parental: false, conditional: false, inUseFrom: null, reviewOn: null });
  });

  it("reads the checkboxes and dates", () => {
    const r = parseConsentForm(form({ parental: "on", conditional: "on", inUseFrom: "2026-01-05", reviewOn: "2027-01-05" }), today);
    expect(r.data).toMatchObject({ parental: true, conditional: true, inUseFrom: "2026-01-05", reviewOn: "2027-01-05" });
  });

  it("needs a name, an activity and a method", () => {
    expect(Object.keys(errors(form({ name: " ", activityId: "", method: "" }))).sort()).toEqual(["activityId", "method", "name"]);
    expect(errors(form({ activityId: "not-an-id" }))).toHaveProperty("activityId");
    expect(errors(form({ method: "telepathy" }))).toHaveProperty("method");
  });

  it("won't date the wording in the future, or review it before it was used", () => {
    expect(errors(form({ inUseFrom: "2026-10-11" }))).toEqual({ inUseFrom: "This can't be in the future." });
    expect(errors(form({ inUseFrom: "2026-06-01", reviewOn: "2026-05-01" }))).toHaveProperty("reviewOn");
    expect(errors(form({ reviewOn: "2026-13-01" }))).toHaveProperty("reviewOn");
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let activityId: string;
  let consentId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId, name: "Pupil photographs", purpose: "Show school life", lawfulBasis: "consent", retentionPeriod: "2 years" })
      .returning();
    activityId = activity.id;
    const [consent] = await db.insert(consentRecords).values({ orgId, activityId, name: "Photographs on the website", method: "written" }).returning();
    consentId = consent.id;
  });

  it("covers its activity until it is deleted", async () => {
    const uncovered = async () => activitiesWithoutConsent(await db.select().from(processingActivities), await db.select().from(consentRecords));
    expect(await uncovered()).toEqual([]);
    await db.delete(consentRecords).where(eq(consentRecords.id, consentId));
    expect((await uncovered()).map((a) => a.name)).toEqual(["Pupil photographs"]);
  });

  it("keeps the record, unlinked, when its activity is deleted", async () => {
    await db.delete(processingActivities).where(eq(processingActivities.id, activityId));
    expect(await db.select().from(consentRecords)).toEqual([expect.objectContaining({ id: consentId, activityId: null })]);
  });

  it("only stores a method it knows", async () => {
    await expect(db.update(consentRecords).set({ method: "telepathy" }).where(eq(consentRecords.id, consentId))).rejects.toThrow();
  });

  it("logs changes under their own area and links entries to the record while it exists", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(consentRecords).where(eq(consentRecords.id, consentId));
    expect(changedFields(before, { ...before, evidence: "Signed forms", parental: true }, FIELD_LABELS.consent)).toEqual([
      "where the proof is kept",
      "given by a parent or guardian",
    ]);

    await recordActivity(db, { orgId, actorId: user.id, area: "consent", subjectId: consentId, summary: `added ${describeRecord.consent(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "consent", summary: "added the consent record “Photographs on the website”" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/consents/${consentId}`);

    await db.delete(consentRecords).where(eq(consentRecords.id, consentId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
