import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { daysToNextDisposal, disposalGaps, disposalStatus, followedUp, latestByActivity } from "@/lib/disposal";
import { parseDisposalForm } from "@/lib/disposal-form";

const { activityLog, disposals, organizations, processingActivities, users } = schema;

const today = "2026-10-10";

describe("disposal status", () => {
  const files = { id: "d1", activityId: "a1", disposedOn: "2025-10-01", nextOn: "2026-10-10" };

  it("is due for the next round from its date", () => {
    const latest = latestByActivity([files]);
    expect(disposalStatus(files, latest, "2026-10-09")).toBe("done");
    expect(disposalStatus(files, latest, "2026-10-10")).toBe("next_due");
    expect(daysToNextDisposal(files, "2026-10-03")).toBe(7);
    expect(daysToNextDisposal(files, "2026-10-12")).toBe(-2);
  });

  it("is never due when no next round is planned", () => {
    const oneOff = { ...files, nextOn: null };
    expect(disposalStatus(oneOff, latestByActivity([oneOff]), "2030-01-01")).toBe("done");
    expect(daysToNextDisposal(oneOff, today)).toBeNull();
  });

  it("stops being due once a later disposal is recorded for the same activity", () => {
    const next = { id: "d2", activityId: "a1", disposedOn: "2026-10-08", nextOn: null };
    const latest = latestByActivity([files, next]);
    expect(followedUp(files, latest)).toBe(true);
    expect(followedUp(next, latest)).toBe(false);
    expect(disposalStatus(files, latest, today)).toBe("done");
  });

  it("stays due when the later disposal is for another activity, or for none", () => {
    const other = { id: "d2", activityId: "a2", disposedOn: "2026-10-08", nextOn: null };
    const loose = { id: "d3", activityId: null, disposedOn: "2026-10-08", nextOn: null };
    expect(disposalStatus(files, latestByActivity([files, other, loose]), today)).toBe("next_due");
  });

  it("can't be followed up without an activity to match on", () => {
    const loose = { id: "d1", activityId: null, disposedOn: "2025-10-01", nextOn: "2026-10-01" };
    const later = { id: "d2", activityId: null, disposedOn: "2026-10-08", nextOn: null };
    expect(disposalStatus(loose, latestByActivity([loose, later]), today)).toBe("next_due");
  });
});

describe("disposalGaps", () => {
  const complete = { activityId: "a1", recordCount: 40, authorisedBy: "The head teacher", evidence: "Destruction certificate" };

  it("finds nothing missing from a complete record", () => {
    expect(disposalGaps(complete)).toEqual([]);
  });

  it("asks for the activity, the count, who authorised it and the proof", () => {
    const gaps = disposalGaps({ activityId: null, recordCount: null, authorisedBy: "", evidence: "" });
    expect(gaps).toHaveLength(4);
    expect(gaps[0]).toContain("Link the processing activity");
    expect(gaps[1]).toContain("how many records");
    expect(gaps[2]).toContain("authorised");
    expect(gaps[3]).toContain("proof");
  });
});

describe("parseDisposalForm", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { description: "Admission files of pupils who left before 2019", disposedOn: "2026-10-01", method: "shredded", reason: "retention", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const parsed = parseDisposalForm(fd, today);
    return parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("accepts the least a disposal needs and leaves the rest empty", () => {
    const parsed = parseDisposalForm(form(), today);
    expect(parsed.success && parsed.data).toEqual({
      description: "Admission files of pupils who left before 2019",
      activityId: null,
      disposedOn: "2026-10-01",
      method: "shredded",
      reason: "retention",
      recordCount: null,
      authorisedBy: "",
      carriedOutBy: "",
      evidence: "",
      nextOn: null,
      notes: "",
    });
  });

  it("reads the optional fields", () => {
    const parsed = parseDisposalForm(form({ activityId: "6f1c2f0e-8c1e-4a57-9d55-0a4f3a1b2c3d", recordCount: " 240 ", nextOn: "2027-10-01" }), today);
    expect(parsed.success && parsed.data).toMatchObject({ activityId: "6f1c2f0e-8c1e-4a57-9d55-0a4f3a1b2c3d", recordCount: 240, nextOn: "2027-10-01" });
  });

  it("needs a description, a date, a method and a reason", () => {
    const fd = new FormData();
    expect(Object.keys(errors(fd)).sort()).toEqual(["description", "disposedOn", "method", "reason"]);
  });

  it("only records a disposal that has happened", () => {
    expect(errors(form({ disposedOn: today }))).toEqual({});
    expect(errors(form({ disposedOn: "2026-10-11" })).disposedOn).toContain("future");
    expect(errors(form({ disposedOn: "2026-02-30" })).disposedOn).toBe("Enter the date it was done.");
  });

  it("puts the next round after the disposal", () => {
    expect(errors(form({ nextOn: "2026-10-01" })).nextOn).toBe("This must be after the disposal.");
    expect(errors(form({ nextOn: "2026-10-02" }))).toEqual({});
  });

  it("rejects a count that isn't a positive whole number, an unknown method and a made-up activity", () => {
    for (const recordCount of ["0", "-3", "2.5", "lots"]) expect(errors(form({ recordCount })).recordCount).toContain("whole number");
    expect(errors(form({ method: "burned" })).method).toBe("Choose how it was disposed of.");
    expect(errors(form({ reason: "bored" })).reason).toBe("Choose why it was disposed of.");
    expect(errors(form({ activityId: "payroll" })).activityId).toBe("Choose an activity from the list.");
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let activityId: string;
  let disposalId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId, name: "Student records", purpose: "Run the school", lawfulBasis: "contract", retentionPeriod: "Enrolment plus 7 years" })
      .returning();
    activityId = activity.id;
    const [disposal] = await db
      .insert(disposals)
      .values({ orgId, activityId, description: "Old admission files", disposedOn: "2026-09-15", method: "shredded", reason: "retention" })
      .returning();
    disposalId = disposal.id;
  });

  it("keeps the record, unlinked, when its activity is deleted", async () => {
    await db.delete(processingActivities).where(eq(processingActivities.id, activityId));
    expect(await db.select().from(disposals)).toEqual([expect.objectContaining({ id: disposalId, activityId: null })]);
  });

  it("goes with its organisation", async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    expect(await db.select().from(disposals)).toEqual([]);
  });

  it("only stores a method and a reason it knows, and a count above zero", async () => {
    const update = (set: Partial<typeof disposals.$inferInsert>) => db.update(disposals).set(set).where(eq(disposals.id, disposalId));
    await expect(update({ method: "burned" })).rejects.toThrow();
    await expect(update({ reason: "bored" })).rejects.toThrow();
    await expect(update({ recordCount: 0 })).rejects.toThrow();
    await update({ recordCount: 1 });
  });

  it("logs changes under their own area, by date and not by description", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(disposals).where(eq(disposals.id, disposalId));
    expect(changedFields(before, { ...before, evidence: "Destruction certificate", recordCount: 40 }, FIELD_LABELS.disposal)).toEqual([
      "number of records",
      "where the proof is kept",
    ]);

    await recordActivity(db, { orgId, actorId: user.id, area: "disposal", subjectId: disposalId, summary: `recorded ${describeRecord.disposal(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "disposal", summary: "recorded the disposal on 15 Sept 2026" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/disposals/${disposalId}`);

    await db.delete(disposals).where(eq(disposals.id, disposalId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
