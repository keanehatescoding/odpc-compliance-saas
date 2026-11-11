import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, FIELD_LABELS } from "@/lib/activity";
import {
  activitiesWithIndirectCollectionIssues,
  describeIndirectCollectionGrounds,
  INDIRECT_COLLECTION_GAP,
  INDIRECT_COLLECTION_GROUND_DETAIL,
  INDIRECT_COLLECTION_GROUND_KEYS,
  INDIRECT_COLLECTION_GROUND_SECTION,
  INDIRECT_COLLECTION_GROUNDS,
  indirectCollectionFinding,
  indirectCollectionIssues,
  indirectCollectionNotice,
  indirectCollectionTodo,
  type IndirectCollectionLike,
} from "@/lib/indirect-collection";
import { ROPA_PARTICULARS } from "@/lib/particulars";
import { ACTIVITY_TEMPLATES } from "@/lib/ropa";

const { organizations, processingActivities } = schema;

const payroll: IndirectCollectionLike = {
  name: "Payroll",
  role: "controller",
  indirectCollection: true,
  indirectSources: "Next of kin's names and phone numbers, given by the employee",
  indirectCollectionGrounds: ["no_prejudice"],
  indirectCollectionNotice: "The staff handbook asks employees to tell their next of kin",
};

const direct: IndirectCollectionLike = {
  name: "Website enquiries",
  role: "controller",
  indirectCollection: false,
  indirectSources: "",
  indirectCollectionGrounds: [],
  indirectCollectionNotice: "",
};

describe("indirectCollectionIssues", () => {
  it("asks nothing of an activity whose data all comes from the person", () => {
    expect(indirectCollectionIssues(direct)).toEqual([]);
  });

  it("asks nothing more of a fully recorded activity", () => {
    expect(indirectCollectionIssues(payroll)).toEqual([]);
  });

  it("asks for the sources, the ground and the notice", () => {
    const bare = { ...payroll, indirectSources: " ", indirectCollectionGrounds: [], indirectCollectionNotice: "" };
    expect(indirectCollectionIssues(bare)).toEqual(["no_sources", "no_ground", "no_notice"]);
  });

  it("leaves the ground to the controller when the activity is a processor's, but still asks how people are told", () => {
    const processor = { ...payroll, role: "processor", indirectCollectionGrounds: [], indirectCollectionNotice: "" };
    expect(indirectCollectionIssues(processor)).toEqual(["no_notice"]);
  });

  it("asks a controller nobody has confirmed for the ground", () => {
    expect(indirectCollectionIssues({ ...payroll, role: null, indirectCollectionGrounds: [] })).toEqual(["no_ground"]);
  });

  it("lists only the activities with something missing", () => {
    const missing = { ...payroll, name: "CCTV", indirectCollectionNotice: "" };
    expect(activitiesWithIndirectCollectionIssues([direct, payroll, missing])).toEqual([{ activity: missing, issues: ["no_notice"] }]);
  });
});

describe("wording", () => {
  it("gives a gap, a section and a detail for every ground and issue", () => {
    for (const k of INDIRECT_COLLECTION_GROUND_KEYS) {
      expect(INDIRECT_COLLECTION_GROUND_SECTION[k]).toMatch(/^s\.28\(2\)\([a-f]\)/);
      expect(INDIRECT_COLLECTION_GROUND_DETAIL[k]).toBeTruthy();
    }
    expect(Object.keys(INDIRECT_COLLECTION_GAP)).toEqual(["no_sources", "no_ground", "no_notice"]);
  });

  it("puts the issues in one dashboard step and one report finding", () => {
    expect(indirectCollectionTodo(payroll, ["no_sources"])).toBe("Say where it comes from for the data Payroll gets from others");
    expect(indirectCollectionTodo(payroll, ["no_sources", "no_ground", "no_notice"])).toBe(
      "Say where it comes from, what allows it and how people are told for the data Payroll gets from others",
    );
    expect(indirectCollectionFinding(payroll, ["no_ground", "no_notice"])).toBe(
      "Payroll collects data from someone other than the person it's about, and the record doesn't say what s.28(2) ground allows it and how people are told within 14 days.",
    );
  });

  it("describes the grounds in the Act's order and skips any it doesn't know", () => {
    expect(describeIndirectCollectionGrounds(["crime", "public_record", "convenience"])).toEqual([
      INDIRECT_COLLECTION_GROUNDS.public_record,
      INDIRECT_COLLECTION_GROUNDS.crime,
    ]);
    expect(describeIndirectCollectionGrounds([])).toEqual([]);
  });

  it("tells people in the privacy notice where data that isn't from them comes from", () => {
    expect(indirectCollectionNotice(direct)).toBeNull();
    expect(indirectCollectionNotice(payroll)).toBe(
      "Some of it comes from others, not from you. Next of kin's names and phone numbers, given by the employee.",
    );
    expect(indirectCollectionNotice({ ...payroll, indirectSources: "  " })).toBe("Some of it comes from others, not from you.");
  });
});

describe("templates", () => {
  it("records where every template's data from others comes from, what allows it, in the Act's order", () => {
    for (const t of ACTIVITY_TEMPLATES) {
      if (!t.indirectCollection) {
        expect(t).toMatchObject({ indirectSources: "", indirectCollectionGrounds: [], indirectCollectionNotice: "" });
        continue;
      }
      expect(t.indirectSources, t.id).toBeTruthy();
      expect(t.indirectCollectionGrounds.length, t.id).toBeGreaterThan(0);
      expect(t.indirectCollectionGrounds, t.id).toEqual(INDIRECT_COLLECTION_GROUND_KEYS.filter((k) => t.indirectCollectionGrounds.includes(k)));
    }
  });
});

describe("in the database", () => {
  let db: Db;
  let activityId: string;

  beforeEach(async () => {
    const client = new PGlite();
    const pg = drizzle({ client, schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    db = pg as unknown as Db;
    const [org] = await db.insert(organizations).values({ name: "Afya Clinic", sector: "health", size: "micro_small" }).returning();
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId: org.id, name: "Staff records", purpose: "Employ staff", lawfulBasis: "contract", retentionPeriod: "7 years" })
      .returning();
    activityId = activity.id;
  });

  const update = (set: Partial<typeof processingActivities.$inferInsert>) =>
    db.update(processingActivities).set(set).where(eq(processingActivities.id, activityId));

  it("starts an activity with its data coming from the person", async () => {
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row).toMatchObject({ indirectCollection: false, indirectSources: "", indirectCollectionGrounds: [], indirectCollectionNotice: "" });
  });

  it("keeps the details only on an activity that collects from others", async () => {
    await expect(update({ indirectSources: "Next of kin" })).rejects.toThrow();
    await expect(update({ indirectCollectionGrounds: ["no_prejudice"] })).rejects.toThrow();
    await expect(update({ indirectCollectionNotice: "Handbook" })).rejects.toThrow();
    await update({ indirectCollection: true, indirectSources: "Next of kin", indirectCollectionGrounds: ["consent", "no_prejudice"] });
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row.indirectCollectionGrounds).toEqual(["consent", "no_prejudice"]);
    await expect(update({ indirectCollection: false })).rejects.toThrow();
  });

  it("only stores a ground it knows", async () => {
    await expect(update({ indirectCollection: true, indirectCollectionGrounds: ["convenience" as "consent"] })).rejects.toThrow();
  });

  it("names the changes in the activity's history, without counting them as registered particulars", () => {
    const before = { indirectCollection: false, indirectSources: "", indirectCollectionGrounds: [], indirectCollectionNotice: "" };
    const after = { indirectCollection: true, indirectSources: "Next of kin", indirectCollectionGrounds: ["no_prejudice"], indirectCollectionNotice: "Handbook" };
    expect(changedFields(before, after, FIELD_LABELS.ropa)).toEqual([
      "data collected from others",
      "where data from others comes from",
      "what allows collecting data from others",
      "how people are told their data came from others",
    ]);
    for (const key of Object.keys(before)) expect(ROPA_PARTICULARS).not.toHaveProperty(key);
  });
});
