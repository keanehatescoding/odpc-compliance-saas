import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, FIELD_LABELS } from "@/lib/activity";
import { SENSITIVE_CATEGORIES } from "@/lib/dpa";
import { ROPA_PARTICULARS } from "@/lib/particulars";
import {
  activitiesWithSensitiveDataIssues,
  describeHealthDataCondition,
  describeSensitiveDataGround,
  HEALTH_CATEGORY,
  HEALTH_DATA_CONDITION_KEYS,
  HEALTH_DATA_CONDITION_SECTION,
  HEALTH_DATA_CONDITIONS,
  SENSITIVE_DATA_GAP,
  SENSITIVE_DATA_GROUND_DETAIL,
  SENSITIVE_DATA_GROUND_KEYS,
  SENSITIVE_DATA_GROUND_SECTION,
  SENSITIVE_DATA_GROUNDS,
  sensitiveDataFinding,
  type SensitiveDataLike,
  sensitiveDataIssues,
  sensitiveDataTodo,
} from "@/lib/sensitive-data";

const { organizations, processingActivities } = schema;

const sickLeave: SensitiveDataLike = {
  name: "Staff sick leave",
  role: "controller",
  sensitiveCategories: ["Health status"],
  sensitiveDataGround: "obligations",
  sensitiveDataBasis: "Employment Act, 2007: sick leave on a medical certificate",
  healthDataCondition: "confidentiality",
  sensitiveDataSafeguards: "Certificates in a locked HR file only HR can open",
};
const unrecorded: SensitiveDataLike = {
  ...sickLeave,
  sensitiveDataGround: null,
  sensitiveDataBasis: "",
  healthDataCondition: null,
  sensitiveDataSafeguards: " ",
};

describe("sensitiveDataIssues", () => {
  it("has none for an activity with no sensitive data, whatever its fields say", () => {
    expect(sensitiveDataIssues({ ...unrecorded, sensitiveCategories: [] })).toEqual([]);
  });

  it("has none when everything is recorded", () => {
    expect(sensitiveDataIssues(sickLeave)).toEqual([]);
  });

  it("lists each missing detail, treating blank text as missing", () => {
    expect(sensitiveDataIssues(unrecorded)).toEqual(["no_ground", "no_health_condition", "no_safeguards"]);
    expect(sensitiveDataIssues({ ...sickLeave, sensitiveDataSafeguards: "  " })).toEqual(["no_safeguards"]);
  });

  it("asks what the ground rests on only once a ground is given", () => {
    expect(sensitiveDataIssues({ ...sickLeave, sensitiveDataBasis: " " })).toEqual(["no_basis"]);
    expect(sensitiveDataIssues({ ...sickLeave, sensitiveDataGround: null, sensitiveDataBasis: "" })).toEqual(["no_ground"]);
  });

  it("asks who handles the health data only when there is some", () => {
    expect(sensitiveDataIssues({ ...unrecorded, sensitiveCategories: ["Biometric data"] })).toEqual(["no_ground", "no_safeguards"]);
  });

  it("leaves the ground to the controller, but not the health condition or safeguards, when the organisation is a processor", () => {
    expect(sensitiveDataIssues({ ...unrecorded, role: "processor" })).toEqual(["no_health_condition", "no_safeguards"]);
    expect(sensitiveDataIssues({ ...unrecorded, role: null })).toContain("no_ground");
  });

  it("explains every issue, ground and condition, and names the paragraph each comes from", () => {
    for (const issue of sensitiveDataIssues(unrecorded)) expect(SENSITIVE_DATA_GAP[issue]).toBeTruthy();
    expect(SENSITIVE_DATA_GAP.no_basis).toBeTruthy();
    for (const g of SENSITIVE_DATA_GROUND_KEYS) {
      expect(SENSITIVE_DATA_GROUNDS[g]).toBeTruthy();
      expect(SENSITIVE_DATA_GROUND_DETAIL[g]).toBeTruthy();
      expect(SENSITIVE_DATA_GROUND_SECTION[g]).toMatch(/^s\.45\(/);
    }
    for (const c of HEALTH_DATA_CONDITION_KEYS) {
      expect(HEALTH_DATA_CONDITIONS[c]).toBeTruthy();
      expect(HEALTH_DATA_CONDITION_SECTION[c]).toMatch(/^s\.46\(/);
    }
  });

  it("offers no consent ground, as s.45 has none", () => {
    expect(SENSITIVE_DATA_GROUND_KEYS).not.toContain("consent");
  });

  it("checks for health data under the name the statutory list uses", () => {
    expect(SENSITIVE_CATEGORIES).toContain(HEALTH_CATEGORY);
  });
});

describe("what the gaps read as", () => {
  it("joins the missing details into one next step", () => {
    expect(sensitiveDataTodo(sickLeave, ["no_ground"])).toBe("Say what allows it for the sensitive data in Staff sick leave");
    expect(sensitiveDataTodo(sickLeave, ["no_ground", "no_health_condition", "no_safeguards"])).toBe(
      "Say what allows it, who handles the health data and how it's protected for the sensitive data in Staff sick leave",
    );
  });

  it("states them as a finding for the report", () => {
    expect(sensitiveDataFinding(sickLeave, ["no_basis", "no_safeguards"])).toBe(
      "Staff sick leave involves sensitive personal data, and the record doesn't say what the s.45 ground rests on and how it's protected or kept apart.",
    );
  });

  it("only picks out the activities with sensitive data and something missing", () => {
    const fine = { ...sickLeave, name: "Fine" };
    const none = { ...unrecorded, name: "None", sensitiveCategories: [] };
    const gaps = activitiesWithSensitiveDataIssues([fine, none, unrecorded]);
    expect(gaps.map((g) => g.activity)).toEqual([unrecorded]);
    expect(gaps[0].issues).toHaveLength(3);
  });

  it("describes the ground and condition with the paragraph they come from", () => {
    expect(describeSensitiveDataGround("legal_claim")).toBe("Needed to establish, exercise or defend a legal claim (s.45(c)(i))");
    expect(describeHealthDataCondition("public_health")).toBe("Needed for reasons of public interest in public health (s.46(2)(a))");
    expect(describeSensitiveDataGround(null)).toBeNull();
    expect(describeHealthDataCondition("unknown")).toBeNull();
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

  it("starts an activity with nothing recorded about sensitive data", async () => {
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row).toMatchObject({ sensitiveDataGround: null, sensitiveDataBasis: "", healthDataCondition: null, sensitiveDataSafeguards: "" });
  });

  it("keeps the details only on an activity with sensitive data", async () => {
    await expect(update({ sensitiveDataGround: "obligations" })).rejects.toThrow();
    await expect(update({ sensitiveDataBasis: "Employment Act" })).rejects.toThrow();
    await expect(update({ sensitiveDataSafeguards: "Locked file" })).rejects.toThrow();
    await update({ sensitiveCategories: ["Marital status"], sensitiveDataGround: "obligations", sensitiveDataSafeguards: "Locked file" });
    await expect(update({ sensitiveCategories: [] })).rejects.toThrow();
  });

  it("keeps the health condition only on an activity with health data", async () => {
    await expect(update({ sensitiveCategories: ["Marital status"], healthDataCondition: "confidentiality" })).rejects.toThrow();
    await update({ sensitiveCategories: ["Marital status", "Health status"], healthDataCondition: "confidentiality" });
    await expect(update({ sensitiveCategories: ["Marital status"] })).rejects.toThrow();
  });

  it("only stores a ground or condition it knows", async () => {
    await expect(update({ sensitiveCategories: ["Health status"], sensitiveDataGround: "consent" as "obligations" })).rejects.toThrow();
    await expect(update({ sensitiveCategories: ["Health status"], healthDataCondition: "anyone" as "public_health" })).rejects.toThrow();
  });

  it("names the changes in the activity's history, without counting them as registered particulars", () => {
    const before = { sensitiveDataGround: null, sensitiveDataBasis: "", healthDataCondition: null, sensitiveDataSafeguards: "" };
    const after = { sensitiveDataGround: "obligations", sensitiveDataBasis: "Employment Act", healthDataCondition: "confidentiality", sensitiveDataSafeguards: "Locked file" };
    expect(changedFields(before, after, FIELD_LABELS.ropa)).toEqual([
      "what allows the sensitive data",
      "what the sensitive data ground rests on",
      "who handles the health data",
      "safeguards for the sensitive data",
    ]);
    for (const key of Object.keys(before)) expect(ROPA_PARTICULARS).not.toHaveProperty(key);
  });
});
