import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, FIELD_LABELS } from "@/lib/activity";
import {
  activitiesWithDataLocalisationIssues,
  DATA_LOCALISATION_GAP,
  dataLocalisationFinding,
  dataLocalisationIssues,
  dataLocalisationTodo,
  type DataLocalisationLike,
  describeKenyaDataPurpose,
  describeKenyaHosting,
  KENYA_DATA_PURPOSE_KEYS,
  KENYA_DATA_PURPOSE_SECTION,
  processorsByActivity,
} from "@/lib/data-localisation";
import { ROPA_PARTICULARS } from "@/lib/particulars";
import { ACTIVITY_TEMPLATES, activityToSave, parseActivityForm, ROPA_COLUMNS, type ActivityInput } from "@/lib/ropa";
import { openTestDb } from "./helpers/db";

const { organizations, processingActivities } = schema;

const pupils: DataLocalisationLike = {
  name: "Pupil records",
  kenyaDataPurpose: "basic_education",
  kenyaHosting: "in_kenya",
  kenyaDataCentre: "School management system hosted in Nairobi",
};

const payroll: DataLocalisationLike = { name: "Payroll", kenyaDataPurpose: null, kenyaHosting: null, kenyaDataCentre: "" };

const local = { name: "Elimu Systems", outsideKenya: false };
const abroad = { name: "Jumbe Bulk SMS", outsideKenya: true };

describe("dataLocalisationIssues", () => {
  it("asks nothing of an activity no reg. 26(2) purpose applies to", () => {
    expect(dataLocalisationIssues(payroll, [abroad])).toEqual([]);
  });

  it("asks nothing more of a fully recorded activity", () => {
    expect(dataLocalisationIssues(pupils, [local])).toEqual([]);
  });

  it("asks how and where the data is kept in Kenya", () => {
    expect(dataLocalisationIssues({ ...pupils, kenyaHosting: null, kenyaDataCentre: " " })).toEqual(["no_hosting", "no_data_centre"]);
  });

  it("flags a processor abroad on data recorded as processed only in Kenya", () => {
    expect(dataLocalisationIssues(pupils, [local, abroad])).toEqual(["processed_abroad"]);
  });

  it("accepts a processor abroad alongside a serving copy kept in Kenya (reg. 26(1)(b))", () => {
    expect(dataLocalisationIssues({ ...pupils, kenyaHosting: "serving_copy" }, [abroad])).toEqual([]);
  });

  it("lists only the activities with something missing, with their own processors", () => {
    const fees = { ...pupils, name: "Fees", kenyaDataCentre: "" };
    const processorsOf = (a: DataLocalisationLike) => (a.name === "Pupil records" ? [abroad] : []);
    expect(activitiesWithDataLocalisationIssues([payroll, pupils, fees], processorsOf)).toEqual([
      { activity: pupils, issues: ["processed_abroad"] },
      { activity: fees, issues: ["no_data_centre"] },
    ]);
  });

  it("finds each activity's processors from the register's links", () => {
    const processorsOf = processorsByActivity(
      [
        { id: "p1", ...local },
        { id: "p2", ...abroad },
      ],
      [
        { processorId: "p1", activityId: "a1" },
        { processorId: "p2", activityId: "a1" },
        { processorId: "p2", activityId: "a2" },
        { processorId: "gone", activityId: "a2" },
      ],
    );
    expect(processorsOf("a1").map((p) => p.name)).toEqual(["Elimu Systems", "Jumbe Bulk SMS"]);
    expect(processorsOf("a2").map((p) => p.name)).toEqual(["Jumbe Bulk SMS"]);
    expect(processorsOf("a3")).toEqual([]);
  });
});

describe("wording", () => {
  it("gives a gap for every issue, and a paragraph of reg. 26(2) for every purpose", () => {
    expect(Object.keys(DATA_LOCALISATION_GAP)).toEqual(["no_hosting", "no_data_centre", "processed_abroad"]);
    expect(KENYA_DATA_PURPOSE_KEYS.map((k) => KENYA_DATA_PURPOSE_SECTION[k])).toEqual([
      "reg. 26(2)(a)",
      "reg. 26(2)(b)",
      "reg. 26(2)(c)",
      "reg. 26(2)(d)",
      "reg. 26(2)(e)",
      "reg. 26(2)(f)",
    ]);
  });

  it("puts the issues in one dashboard step", () => {
    expect(dataLocalisationTodo(pupils, ["no_hosting", "no_data_centre"])).toBe(
      "Say how the data is kept in Kenya and which data centre in Kenya holds it for Pupil records",
    );
    expect(dataLocalisationTodo(pupils, ["processed_abroad"])).toBe("Keep a copy in Kenya of the data in Pupil records, which a processor holds abroad");
  });

  it("states them as a report finding, naming the processors abroad", () => {
    expect(dataLocalisationFinding(pupils, ["no_hosting", "no_data_centre"])).toBe(
      "Pupil records has to be kept in Kenya (reg. 26(2)(e): Early childhood or basic education (Basic Education Act, 2013)), and the record doesn't say how (reg. 26(1)) and which data centre in Kenya holds it.",
    );
    expect(dataLocalisationFinding(pupils, ["processed_abroad"], [local, abroad])).toBe(
      "Pupil records has to be kept in Kenya (reg. 26(2)(e): Early childhood or basic education (Basic Education Act, 2013)), and it's recorded as processed only in Kenya, but Jumbe Bulk SMS holds the data outside Kenya.",
    );
  });

  it("describes the purpose and how the data is kept", () => {
    expect(describeKenyaDataPurpose(payroll)).toBe("");
    expect(describeKenyaHosting(payroll)).toBe("");
    expect(describeKenyaDataPurpose({ kenyaDataPurpose: "health_care" })).toBe("Primary or secondary health care");
    expect(describeKenyaHosting(pupils)).toBe("Processed through a server and data centre in Kenya");
    expect(describeKenyaHosting({ ...pupils, kenyaHosting: null })).toBe("Not recorded");
  });
});

describe("the RoPA", () => {
  const form = () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      name: "Pupils",
      purpose: "Teach",
      lawfulBasis: "legal_obligation",
      role: "controller",
      dataSubjects: "Students",
      dataCategories: "Name",
      retentionPeriod: "7 years",
      kenyaHosting: "serving_copy",
      kenyaDataCentre: "Nairobi",
    }))
      f.set(k, v);
    return f;
  };

  it("reads the details from the form, and clears them when no purpose is chosen", () => {
    const none = parseActivityForm(form());
    expect(none.success).toBe(true);
    expect(activityToSave(none.data as ActivityInput)).toMatchObject({ kenyaDataPurpose: null, kenyaHosting: null, kenyaDataCentre: "" });
    const f = form();
    f.set("kenyaDataPurpose", "basic_education");
    const chosen = parseActivityForm(f);
    expect(activityToSave(chosen.data as ActivityInput)).toMatchObject({
      kenyaDataPurpose: "basic_education",
      kenyaHosting: "serving_copy",
      kenyaDataCentre: "Nairobi",
    });
  });

  it("turns away a purpose or a way of keeping the data that isn't listed", () => {
    const f = form();
    f.set("kenyaDataPurpose", "banking");
    f.set("kenyaHosting", "abroad");
    const parsed = parseActivityForm(f);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["kenyaDataPurpose", "kenyaHosting"]));
  });

  it("exports the details as columns", () => {
    const cells = (a: ActivityInput) => Object.fromEntries(ROPA_COLUMNS.map((c) => [c.header, c.value(a)]));
    const template = ACTIVITY_TEMPLATES.find((t) => t.id === "patient-records")!;
    expect(cells({ ...template, kenyaHosting: "in_kenya", kenyaDataCentre: "EMR hosted in Nairobi" })).toMatchObject({
      "Has to be kept in Kenya (reg. 26(2))": "Primary or secondary health care",
      "How it's kept in Kenya (reg. 26(1))": "Processed through a server and data centre in Kenya",
      "Data centre in Kenya": "EMR hosted in Nairobi",
    });
    const hr = ACTIVITY_TEMPLATES.find((t) => t.id === "hr-payroll")!;
    expect(cells(hr)).toMatchObject({ "Has to be kept in Kenya (reg. 26(2))": "No", "How it's kept in Kenya (reg. 26(1))": "", "Data centre in Kenya": "" });
  });

  it("gives the school and clinic records their purpose, and leaves how they're kept to the organisation", () => {
    const purposeOf = Object.fromEntries(ACTIVITY_TEMPLATES.filter((t) => t.kenyaDataPurpose).map((t) => [t.id, t.kenyaDataPurpose]));
    expect(purposeOf).toEqual({ "student-records": "basic_education", "school-fees": "basic_education", "patient-records": "health_care" });
    for (const t of ACTIVITY_TEMPLATES) expect(t, t.id).toMatchObject({ kenyaHosting: null, kenyaDataCentre: "" });
  });
});

describe("in the database", () => {
  let db: Db;
  let activityId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const [org] = await db.insert(organizations).values({ name: "Shule Bora", sector: "education", size: "micro_small" }).returning();
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId: org.id, name: "Pupil records", purpose: "Teach pupils", lawfulBasis: "legal_obligation", retentionPeriod: "7 years" })
      .returning();
    activityId = activity.id;
  });

  const update = (set: Partial<typeof processingActivities.$inferInsert>) =>
    db.update(processingActivities).set(set).where(eq(processingActivities.id, activityId));

  it("starts an activity with no reg. 26 purpose", async () => {
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row).toMatchObject({ kenyaDataPurpose: null, kenyaHosting: null, kenyaDataCentre: "" });
  });

  it("keeps the details only on an activity with a purpose", async () => {
    await expect(update({ kenyaHosting: "in_kenya" })).rejects.toThrow();
    await expect(update({ kenyaDataCentre: "Nairobi" })).rejects.toThrow();
    await update({ kenyaDataPurpose: "basic_education", kenyaHosting: "in_kenya", kenyaDataCentre: "Nairobi" });
    await expect(update({ kenyaDataPurpose: null })).rejects.toThrow();
  });

  it("names the changes in the activity's history, without counting them as registered particulars", () => {
    const before = { kenyaDataPurpose: null, kenyaHosting: null, kenyaDataCentre: "" };
    const after = { kenyaDataPurpose: "health_care", kenyaHosting: "serving_copy", kenyaDataCentre: "Nairobi" };
    expect(changedFields(before, after, FIELD_LABELS.ropa)).toEqual(["purpose that keeps the data in Kenya", "how the data is kept in Kenya", "data centre in Kenya"]);
    for (const key of Object.keys(before)) expect(ROPA_PARTICULARS).not.toHaveProperty(key);
  });
});
