import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, describe as describeRecord, FIELD_LABELS, recordActivity, subjectLinks } from "@/lib/activity";
import { daysToRefresher, refreshedIds, trainingGaps, trainingStatus } from "@/lib/training";
import { parseTrainingForm, refresherErrors, type SessionDate } from "@/lib/training-form";

const { activityLog, organizations, trainingSessions, users } = schema;

const today = "2026-10-10";

describe("training status", () => {
  const induction = { id: "t1", refresherOn: "2026-10-10", refreshesId: null };

  it("is due for a refresher from the refresher date", () => {
    const none = new Set<string>();
    expect(trainingStatus(induction, none, "2026-10-09")).toBe("current");
    expect(trainingStatus(induction, none, "2026-10-10")).toBe("refresher_due");
    expect(trainingStatus(induction, none, "2026-12-01")).toBe("refresher_due");
    expect(daysToRefresher(induction, "2026-10-03")).toBe(7);
    expect(daysToRefresher(induction, "2026-10-12")).toBe(-2);
  });

  it("is never due when no refresher is planned", () => {
    const oneOff = { ...induction, refresherOn: null };
    expect(trainingStatus(oneOff, new Set(), "2030-01-01")).toBe("current");
    expect(daysToRefresher(oneOff, today)).toBeNull();
  });

  it("is done with once a later session refreshes it", () => {
    const refresher = { id: "t2", refresherOn: "2027-10-01", refreshesId: "t1" };
    const refreshed = refreshedIds([induction, refresher]);
    expect([...refreshed]).toEqual(["t1"]);
    expect(trainingStatus(induction, refreshed, "2026-12-01")).toBe("refreshed");
    expect(trainingStatus(refresher, refreshed, "2026-12-01")).toBe("current");
  });
});

describe("trainingGaps", () => {
  const complete = { attendeeCount: 12, evidence: "Signed register", refresherOn: "2027-03-02" };

  it("finds nothing missing from a complete record", () => {
    expect(trainingGaps(complete, false)).toEqual([]);
  });

  it("asks for the count, the attendance record and a refresher date", () => {
    const gaps = trainingGaps({ attendeeCount: null, evidence: "", refresherOn: null }, false);
    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toContain("how many");
    expect(gaps[1]).toContain("attendance register");
    expect(gaps[2]).toContain("refresher");
  });

  it("doesn't ask for a refresher date once the refresher has been held", () => {
    expect(trainingGaps({ ...complete, refresherOn: null }, true)).toEqual([]);
  });
});

describe("parseTrainingForm", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { title: "Staff induction", heldOn: "2026-03-02", audience: "All staff", topics: "The basics", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const r = parseTrainingForm(fd, today);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("accepts a session with only a title, a date, an audience and its topics", () => {
    const r = parseTrainingForm(form(), today);
    expect(r.success && r.data).toMatchObject({
      title: "Staff induction",
      heldOn: "2026-03-02",
      attendeeCount: null,
      refresherOn: null,
      refreshesId: null,
      evidence: "",
    });
  });

  it("reads the count, the refresher date and the session it refreshes", () => {
    const earlier = "0b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a4b";
    const r = parseTrainingForm(form({ attendeeCount: " 24 ", refresherOn: "2027-03-02", refreshesId: earlier }), today);
    expect(r.success && r.data).toMatchObject({ attendeeCount: 24, refresherOn: "2027-03-02", refreshesId: earlier });
  });

  it("needs a title, a date, an audience and topics", () => {
    expect(Object.keys(errors(form({ title: "", heldOn: "", audience: "", topics: "" }))).sort()).toEqual(["audience", "heldOn", "title", "topics"]);
    const missing = form();
    missing.delete("heldOn");
    expect(errors(missing)).toEqual({ heldOn: "Enter the date it was held." });
  });

  it("only records a session that has been held", () => {
    expect(errors(form({ heldOn: today }))).toEqual({});
    expect(errors(form({ heldOn: "2026-10-11" }))).toHaveProperty("heldOn");
    expect(errors(form({ heldOn: "2026-02-30" }))).toHaveProperty("heldOn");
  });

  it("wants the refresher after the session", () => {
    expect(errors(form({ refresherOn: "2026-03-02" }))).toHaveProperty("refresherOn");
    expect(errors(form({ refresherOn: "2026-03-03" }))).toEqual({});
  });

  it("rejects a count that isn't a positive whole number", () => {
    for (const attendeeCount of ["0", "-3", "2.5", "a dozen"]) expect(errors(form({ attendeeCount }))).toHaveProperty("attendeeCount");
  });

  it("rejects a refreshed session that isn't an id", () => {
    expect(errors(form({ refreshesId: "t1" }))).toHaveProperty("refreshesId");
  });
});

describe("refresherErrors", () => {
  const induction: SessionDate = { id: "t1", title: "Induction", heldOn: "2025-09-01", refreshesId: null };
  const refresher: SessionDate = { id: "t2", title: "Refresher", heldOn: "2026-09-01", refreshesId: "t1" };
  const all = [induction, refresher];

  it("accepts a refresher held after the session it refreshes", () => {
    expect(refresherErrors({ id: null, heldOn: "2026-09-01", refreshesId: "t1" }, [induction])).toBeNull();
    expect(refresherErrors({ id: null, heldOn: "2026-09-01", refreshesId: null }, all)).toBeNull();
  });

  it("rejects one held on or before it", () => {
    expect(refresherErrors({ id: null, heldOn: "2025-09-01", refreshesId: "t1" }, [induction])).toHaveProperty("refreshesId");
    expect(refresherErrors({ id: null, heldOn: "2025-01-01", refreshesId: "t1" }, [induction])).toHaveProperty("refreshesId");
  });

  it("rejects a session from another organisation, or itself", () => {
    expect(refresherErrors({ id: null, heldOn: "2026-09-01", refreshesId: "elsewhere" }, all)).toEqual({ refreshesId: ["Choose a session from the list."] });
    expect(refresherErrors({ id: "t1", heldOn: "2025-09-01", refreshesId: "t1" }, all)).toHaveProperty("refreshesId");
  });

  it("won't move a session to on or after its own refresher", () => {
    expect(refresherErrors({ id: "t1", heldOn: "2026-08-31", refreshesId: null }, all)).toBeNull();
    expect(refresherErrors({ id: "t1", heldOn: "2026-09-01", refreshesId: null }, all)).toEqual({
      heldOn: ["This must be before its refresher, “Refresher”, was held."],
    });
  });

  it("so two sessions can't refresh each other", () => {
    // t1 would have to be held after t2 to refresh it, and before t2 to be refreshed by it.
    expect(refresherErrors({ id: "t1", heldOn: "2025-09-01", refreshesId: "t2" }, all)).toHaveProperty("refreshesId");
    expect(refresherErrors({ id: "t1", heldOn: "2026-10-01", refreshesId: "t2" }, all)).toHaveProperty("heldOn");
  });
});

describe("in the database", () => {
  let db: Db;
  let orgId: string;
  let inductionId: string;
  let refresherId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;

    const [org] = await db.insert(organizations).values({ name: "Sunrise Academy", sector: "education", size: "micro_small" }).returning();
    orgId = org.id;
    const session = { orgId, audience: "All staff", topics: "The basics" };
    const [induction] = await db.insert(trainingSessions).values({ ...session, title: "Induction", heldOn: "2025-09-01", refresherOn: "2026-09-01" }).returning();
    inductionId = induction.id;
    const [refresher] = await db.insert(trainingSessions).values({ ...session, title: "Refresher", heldOn: "2026-09-10", refreshesId: inductionId }).returning();
    refresherId = refresher.id;
  });

  it("makes the earlier session due again when its refresher is deleted", async () => {
    const status = async () => {
      const rows = await db.select().from(trainingSessions);
      return trainingStatus(rows.find((r) => r.id === inductionId)!, refreshedIds(rows), today);
    };
    expect(await status()).toBe("refreshed");
    await db.delete(trainingSessions).where(eq(trainingSessions.id, refresherId));
    expect(await status()).toBe("refresher_due");
  });

  it("keeps the refresher, unlinked, when the session it refreshed is deleted", async () => {
    await db.delete(trainingSessions).where(eq(trainingSessions.id, inductionId));
    expect(await db.select().from(trainingSessions)).toEqual([expect.objectContaining({ id: refresherId, refreshesId: null })]);
  });

  it("won't store a count of nobody", async () => {
    await expect(db.update(trainingSessions).set({ attendeeCount: 0 }).where(eq(trainingSessions.id, inductionId))).rejects.toThrow();
  });

  it("logs changes under their own area and links entries to the session while it exists", async () => {
    const [user] = await db.insert(users).values({ email: "owner@sunrise.ke", name: "Wanjiku", passwordHash: "x" }).returning();
    const [before] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, inductionId));
    expect(changedFields(before, { ...before, attendeeCount: 24, refresherOn: null }, FIELD_LABELS.training)).toEqual(["number attending", "refresher date"]);

    await recordActivity(db, { orgId, actorId: user.id, area: "training", subjectId: inductionId, summary: `recorded ${describeRecord.training(before)}` });
    const rows = await db.select().from(activityLog);
    expect(rows[0]).toMatchObject({ area: "training", summary: "recorded the training session “Induction”" });
    expect((await subjectLinks(db, orgId, rows)).get(rows[0].id)).toBe(`/training/${inductionId}`);

    await db.delete(trainingSessions).where(eq(trainingSessions.id, inductionId));
    expect((await subjectLinks(db, orgId, rows)).size).toBe(0);
  });
});
