import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { activitiesWithoutAssessment, daysToLiaReview, liaGaps, liaStatus, stillReliedOn } from "@/lib/lia";
import { parseLiaForm } from "@/lib/lia-form";

const { activityLog, interestAssessments, organizations, processingActivities, users } = schema;

const today = "2026-10-10";

describe("assessment status", () => {
  const complete = { interest: "Keeping the premises safe", necessity: "Break-ins went unsolved", impact: "People expect cameras at a gate", outcome: "justified", reviewOn: "2026-10-10" };

  it("isn't finished without the interest, the necessity, the balance and a decision", () => {
    for (const missing of ["interest", "necessity", "impact"] as const) {
      expect(liaStatus({ ...complete, [missing]: "" }, "2026-01-01")).toBe("incomplete");
    }
    expect(liaStatus({ ...complete, outcome: "pending" }, "2026-01-01")).toBe("incomplete");
  });

  it("says so when the decision went against the processing, however much is filled in", () => {
    expect(liaStatus({ ...complete, outcome: "overridden" }, "2026-01-01")).toBe("not_justified");
    expect(liaStatus({ ...complete, interest: "", outcome: "overridden" }, "2027-01-01")).toBe("not_justified");
  });

  it("is due for review from the review date", () => {
    expect(liaStatus(complete, "2026-10-09")).toBe("in_place");
    expect(liaStatus(complete, "2026-10-10")).toBe("review_due");
    expect(daysToLiaReview(complete, "2026-10-03")).toBe(7);
    expect(daysToLiaReview(complete, "2026-10-12")).toBe(-2);
  });

  it("is never due when no review is planned", () => {
    const open = { ...complete, reviewOn: null };
    expect(liaStatus(open, "2030-01-01")).toBe("in_place");
    expect(daysToLiaReview(open, today)).toBeNull();
  });
});

describe("liaGaps", () => {
  const complete = {
    interest: "Keeping the premises safe",
    necessity: "Break-ins went unsolved",
    impact: "People expect cameras at a gate",
    safeguards: "",
    objection: "Tell the office",
    outcome: "justified",
    decidedBy: "The principal",
    decidedOn: "2026-03-01",
  };
  const cctv = { name: "CCTV", lawfulBasis: "legitimate_interests", involvesChildren: false };

  it("finds nothing missing from a complete assessment", () => {
    expect(liaGaps(complete, cctv)).toEqual([]);
  });

  it("asks for the three answers, a decision, a way to object and an activity", () => {
    const gaps = liaGaps({ ...complete, interest: "", necessity: "", impact: "", objection: "", outcome: "pending", decidedBy: "", decidedOn: null }, null);
    expect(gaps).toHaveLength(6);
    expect(gaps[0]).toContain("what the interest is");
    expect(gaps[1]).toContain("necessary");
    expect(gaps[2]).toContain("people concerned");
    expect(gaps[3]).toContain("Record the decision");
    expect(gaps[4]).toContain("Section 36");
    expect(gaps[5]).toContain("Link the processing activity");
  });

  it("asks who decided and when once there is a decision", () => {
    expect(liaGaps({ ...complete, decidedBy: "" }, cctv)).toEqual(["Record who made the decision and when."]);
    expect(liaGaps({ ...complete, decidedOn: null }, cctv)).toEqual(["Record who made the decision and when."]);
  });

  it("notices an activity whose lawful basis isn't legitimate interests", () => {
    const [gap] = liaGaps(complete, { ...cctv, name: "Payroll", lawfulBasis: "contract" });
    expect(gap).toContain("“Performance of a contract with the data subject” as the lawful basis for Payroll");
  });

  it("holds an adverse decision against the activity until its basis changes", () => {
    const against = { ...complete, outcome: "overridden" };
    expect(liaGaps(against, cctv)).toEqual([expect.stringContaining("still relies on legitimate interests for CCTV")]);
    expect(liaGaps(against, { ...cctv, lawfulBasis: "consent" })).toEqual([]);
    expect(stillReliedOn(against, cctv)).toBe(true);
    expect(stillReliedOn(against, { lawfulBasis: "consent" })).toBe(false);
    expect(stillReliedOn(against, null)).toBe(false);
    expect(stillReliedOn(complete, cctv)).toBe(false);
  });

  it("wants safeguards recorded where children are involved", () => {
    const school = { ...cctv, involvesChildren: true };
    expect(liaGaps(complete, school)).toEqual([expect.stringContaining("section 33")]);
    expect(liaGaps({ ...complete, safeguards: "No cameras in changing rooms" }, school)).toEqual([]);
  });
});

describe("activitiesWithoutAssessment", () => {
  const activities = [
    { id: "a1", name: "CCTV", lawfulBasis: "legitimate_interests", role: "controller" },
    { id: "a2", name: "Payroll", lawfulBasis: "contract", role: "controller" },
    { id: "a3", name: "Visitor log", lawfulBasis: "legitimate_interests", role: null },
    { id: "a4", name: "Client fraud checks", lawfulBasis: "legitimate_interests", role: "processor" },
  ];

  it("lists what relies on legitimate interests with no assessment, leaving out what is processed for someone else", () => {
    expect(activitiesWithoutAssessment(activities, []).map((a) => a.name)).toEqual(["CCTV", "Visitor log"]);
    expect(activitiesWithoutAssessment(activities, [{ activityId: "a1" }, { activityId: null }]).map((a) => a.name)).toEqual(["Visitor log"]);
  });
});

describe("parseLiaForm", () => {
  const activityId = "7b0e7a52-5d0c-4a44-9f0e-1c2d3e4f5a6b";
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { name: "CCTV at the gate", activityId, outcome: "pending", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const r = parseLiaForm(fd, today);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("accepts an assessment with only a name and an activity, not yet decided", () => {
    const r = parseLiaForm(form(), today);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ name: "CCTV at the gate", activityId, outcome: "pending", interest: "", objection: "", decidedOn: null, reviewOn: null });
  });

  it("reads the decision and its dates", () => {
    const r = parseLiaForm(form({ outcome: "justified", decidedBy: " The principal ", decidedOn: "2026-10-10", reviewOn: "2027-10-10" }), today);
    expect(r.data).toMatchObject({ outcome: "justified", decidedBy: "The principal", decidedOn: "2026-10-10", reviewOn: "2027-10-10" });
  });

  it("needs a name, an activity and a decision it knows", () => {
    expect(Object.keys(errors(form({ name: " ", activityId: "", outcome: "" }))).sort()).toEqual(["activityId", "name", "outcome"]);
    expect(errors(form({ activityId: "not-an-id" }))).toHaveProperty("activityId");
    expect(errors(form({ outcome: "probably" }))).toHaveProperty("outcome");
  });

  it("won't date a decision in the future or before there is one, or review it before it was made", () => {
    expect(errors(form({ outcome: "justified", decidedOn: "2026-10-11" }))).toEqual({ decidedOn: "This can't be in the future." });
    expect(errors(form({ decidedOn: "2026-06-01" }))).toHaveProperty("decidedOn");
    expect(errors(form({ outcome: "justified", decidedOn: "2026-06-01", reviewOn: "2026-05-01" }))).toHaveProperty("reviewOn");
    expect(errors(form({ reviewOn: "2026-13-01" }))).toHaveProperty("reviewOn");
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let activityId: string;
  let liaId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId, name: "CCTV surveillance", purpose: "Protect the premises", lawfulBasis: "legitimate_interests", retentionPeriod: "30 days" })
      .returning();
    activityId = activity.id;
    const [lia] = await db.insert(interestAssessments).values({ orgId, activityId, name: "CCTV at the gate" }).returning();
    liaId = lia.id;
  });

  it("starts undecided", async () => {
    const [row] = await db.select().from(interestAssessments).where(eq(interestAssessments.id, liaId));
    expect(row).toMatchObject({ outcome: "pending", decidedOn: null, interest: "" });
    expect(liaStatus(row, today)).toBe("incomplete");
  });

  it("covers its activity until it is deleted", async () => {
    const uncovered = async () => activitiesWithoutAssessment(await db.select().from(processingActivities), await db.select().from(interestAssessments));
    expect(await uncovered()).toEqual([]);
    await db.delete(interestAssessments).where(eq(interestAssessments.id, liaId));
    expect((await uncovered()).map((a) => a.name)).toEqual(["CCTV surveillance"]);
  });

  it("keeps the assessment, unlinked, when its activity is deleted", async () => {
    await db.delete(processingActivities).where(eq(processingActivities.id, activityId));
    expect(await db.select().from(interestAssessments)).toEqual([expect.objectContaining({ id: liaId, activityId: null })]);
  });

  it("only stores a decision it knows", async () => {
    await expect(db.update(interestAssessments).set({ outcome: "probably" }).where(eq(interestAssessments.id, liaId))).rejects.toThrow();
  });

  it("logs changes under their own area and links entries to the assessment while it exists", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(interestAssessments).where(eq(interestAssessments.id, liaId));
    expect(changedFields(before, { ...before, interest: "Safety", outcome: "justified" }, FIELD_LABELS.lia)).toEqual(["the interest", "decision"]);

    await recordActivity(db, { orgId, actorId: user.id, area: "lia", subjectId: liaId, summary: `added ${describeRecord.lia(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "lia", summary: "added the legitimate interest assessment “CCTV at the gate”" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/lia/${liaId}`);

    await db.delete(interestAssessments).where(eq(interestAssessments.id, liaId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
