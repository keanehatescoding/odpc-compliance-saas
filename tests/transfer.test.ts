import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { activitiesWithoutTransfer, daysToTransferReview, needsSubjectConsent, transferGaps, transferStatus } from "@/lib/transfer";
import { parseTransferForm } from "@/lib/transfer-form";

const { activityLog, organizations, processingActivities, transfers, users } = schema;

const today = "2026-10-10";

describe("transfer status", () => {
  const complete = { countries: "Ireland", basis: "safeguards", basisDetail: "Standard contractual clauses", reviewOn: "2026-10-10" };

  it("isn't finished without the countries, a basis and what the basis rests on", () => {
    for (const missing of ["countries", "basisDetail"] as const) {
      expect(transferStatus({ ...complete, [missing]: "" }, "2026-01-01")).toBe("incomplete");
    }
    expect(transferStatus({ ...complete, basis: "pending" }, "2026-01-01")).toBe("incomplete");
  });

  it("is due for review from the review date", () => {
    expect(transferStatus(complete, "2026-10-09")).toBe("in_place");
    expect(transferStatus(complete, "2026-10-10")).toBe("review_due");
    expect(daysToTransferReview(complete, "2026-10-03")).toBe(7);
    expect(daysToTransferReview(complete, "2026-10-12")).toBe(-2);
  });

  it("is never due when no review is planned", () => {
    const open = { ...complete, reviewOn: null };
    expect(transferStatus(open, "2030-01-01")).toBe("in_place");
    expect(daysToTransferReview(open, today)).toBeNull();
  });
});

describe("transferGaps", () => {
  const complete = {
    countries: "Ireland",
    dataSent: "Parents' names and phone numbers",
    basis: "safeguards",
    basisDetail: "Standard contractual clauses",
    subjectConsent: "",
    evidence: "Contracts folder",
  };
  const mailing = { name: "Mailing list", crossBorder: true, sensitiveCategories: [] as string[] };

  it("finds nothing missing from a complete record", () => {
    expect(transferGaps(complete, mailing)).toEqual([]);
  });

  it("asks for the countries, the data, a basis and an activity", () => {
    const gaps = transferGaps({ ...complete, countries: "", dataSent: "", basis: "pending", basisDetail: "", evidence: "" }, null);
    expect(gaps).toHaveLength(4);
    expect(gaps[0]).toContain("which country");
    expect(gaps[1]).toContain("what personal data");
    expect(gaps[2]).toContain("Section 48");
    expect(gaps[3]).toContain("Link the processing activity");
  });

  it("asks what the chosen basis rests on, and where the proof is", () => {
    const detail = (basis: string) => transferGaps({ ...complete, basis, basisDetail: "" }, mailing);
    expect(detail("adequacy")).toEqual([expect.stringContaining("data protection law")]);
    expect(detail("safeguards")).toEqual([expect.stringContaining("contract clauses")]);
    expect(detail("necessity")).toEqual([expect.stringContaining("which reason applies")]);
    expect(detail("consent")).toEqual([expect.stringContaining("told about the risks")]);
    expect(transferGaps({ ...complete, evidence: "" }, mailing)).toEqual([expect.stringContaining("where the proof is kept")]);
  });

  it("wants consent recorded where sensitive data leaves Kenya", () => {
    const clinic = { ...mailing, name: "Patient records", sensitiveCategories: ["Health data", "Biometric data"] };
    expect(transferGaps(complete, clinic)).toEqual([expect.stringContaining("Patient records involves sensitive personal data (Health data, Biometric data). Section 49")]);
    expect(transferGaps({ ...complete, subjectConsent: "Asked on the registration form" }, clinic)).toEqual([]);
    expect(needsSubjectConsent(complete, clinic)).toBe(true);
    expect(needsSubjectConsent(complete, mailing)).toBe(false);
    expect(needsSubjectConsent(complete, null)).toBe(false);
  });

  it("notices an activity the RoPA doesn't say sends data abroad", () => {
    expect(transferGaps(complete, { ...mailing, name: "Payroll", crossBorder: false })).toEqual([
      "Your RoPA doesn't say Payroll sends data outside Kenya. Update whichever is wrong.",
    ]);
  });
});

describe("activitiesWithoutTransfer", () => {
  const activities = [
    { id: "a1", name: "Mailing list", crossBorder: true },
    { id: "a2", name: "Payroll", crossBorder: false },
    { id: "a3", name: "Cloud backups", crossBorder: true },
  ];

  it("lists what sends data outside Kenya with no transfer record", () => {
    expect(activitiesWithoutTransfer(activities, []).map((a) => a.name)).toEqual(["Mailing list", "Cloud backups"]);
    expect(activitiesWithoutTransfer(activities, [{ activityId: "a1" }, { activityId: null }]).map((a) => a.name)).toEqual(["Cloud backups"]);
  });
});

describe("parseTransferForm", () => {
  const activityId = "7b0e7a52-5d0c-4a44-9f0e-1c2d3e4f5a6b";
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { recipient: "Mailchimp", activityId, basis: "pending", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const r = parseTransferForm(fd, today);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("accepts a transfer with only a recipient and an activity, its basis not yet decided", () => {
    const r = parseTransferForm(form(), today);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ recipient: "Mailchimp", activityId, basis: "pending", countries: "", evidence: "", startedOn: null, reviewOn: null });
  });

  it("reads the basis and the dates", () => {
    const r = parseTransferForm(form({ basis: "safeguards", countries: " United States ", startedOn: "2026-10-10", reviewOn: "2027-10-10" }), today);
    expect(r.data).toMatchObject({ basis: "safeguards", countries: "United States", startedOn: "2026-10-10", reviewOn: "2027-10-10" });
  });

  it("needs a recipient, an activity and a basis it knows", () => {
    expect(Object.keys(errors(form({ recipient: " ", activityId: "", basis: "" }))).sort()).toEqual(["activityId", "basis", "recipient"]);
    expect(errors(form({ activityId: "not-an-id" }))).toHaveProperty("activityId");
    expect(errors(form({ basis: "trust" }))).toHaveProperty("basis");
  });

  it("won't start a transfer in the future or review it before it began", () => {
    expect(errors(form({ startedOn: "2026-10-11" }))).toEqual({ startedOn: "This can't be in the future." });
    expect(errors(form({ startedOn: "2026-06-01", reviewOn: "2026-05-01" }))).toHaveProperty("reviewOn");
    expect(errors(form({ reviewOn: "2026-13-01" }))).toHaveProperty("reviewOn");
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let activityId: string;
  let transferId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId, name: "Parent newsletter", purpose: "Keep parents informed", lawfulBasis: "consent", retentionPeriod: "Until they unsubscribe", crossBorder: true, transferCountries: "United States" })
      .returning();
    activityId = activity.id;
    const [transfer] = await db.insert(transfers).values({ orgId, activityId, recipient: "Mailchimp" }).returning();
    transferId = transfer.id;
  });

  it("starts with no basis", async () => {
    const [row] = await db.select().from(transfers).where(eq(transfers.id, transferId));
    expect(row).toMatchObject({ basis: "pending", countries: "", reviewOn: null });
    expect(transferStatus(row, today)).toBe("incomplete");
  });

  it("covers its activity until it is deleted", async () => {
    const uncovered = async () => activitiesWithoutTransfer(await db.select().from(processingActivities), await db.select().from(transfers));
    expect(await uncovered()).toEqual([]);
    await db.delete(transfers).where(eq(transfers.id, transferId));
    expect((await uncovered()).map((a) => a.name)).toEqual(["Parent newsletter"]);
  });

  it("keeps the transfer, unlinked, when its activity is deleted", async () => {
    await db.delete(processingActivities).where(eq(processingActivities.id, activityId));
    expect(await db.select().from(transfers)).toEqual([expect.objectContaining({ id: transferId, activityId: null })]);
  });

  it("only stores a basis it knows", async () => {
    await expect(db.update(transfers).set({ basis: "trust" }).where(eq(transfers.id, transferId))).rejects.toThrow();
  });

  it("logs changes under their own area and links entries to the transfer while it exists", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(transfers).where(eq(transfers.id, transferId));
    expect(changedFields(before, { ...before, countries: "United States", basis: "safeguards" }, FIELD_LABELS.transfer)).toEqual(["countries", "what it relies on"]);

    await recordActivity(db, { orgId, actorId: user.id, area: "transfer", subjectId: transferId, summary: `added ${describeRecord.transfer(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "transfer", summary: "added the transfer to Mailchimp" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/transfers/${transferId}`);

    await db.delete(transfers).where(eq(transfers.id, transferId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
