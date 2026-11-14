import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, FIELD_LABELS } from "@/lib/activity";
import {
  activitiesWithChildrenDataIssues,
  CHILDREN_DATA_GAP,
  childrenDataFinding,
  childrenDataIssues,
  childrenDataTodo,
  type ChildrenDataLike,
  describeParentalConsent,
  needsParentalConsent,
} from "@/lib/children-data";
import { ROPA_PARTICULARS } from "@/lib/particulars";
import { ACTIVITY_TEMPLATES, activityToSave, parseActivityForm, ROPA_COLUMNS, type ActivityInput } from "@/lib/ropa";

const { organizations, processingActivities } = schema;

const pupils: ChildrenDataLike = {
  name: "Pupil records",
  role: "controller",
  involvesChildren: true,
  childAgeCheck: "Date of birth checked against the birth certificate",
  childCounselling: false,
  parentalConsent: "A parent signs the admission form; the office checks their ID",
  childSafeguards: "Only the class teacher and the office open the file",
};

const adults: ChildrenDataLike = {
  name: "Staff records",
  role: "controller",
  involvesChildren: false,
  childAgeCheck: "",
  childCounselling: false,
  parentalConsent: "",
  childSafeguards: "",
};

describe("childrenDataIssues", () => {
  it("asks nothing of an activity that doesn't involve children", () => {
    expect(childrenDataIssues(adults)).toEqual([]);
  });

  it("asks nothing more of a fully recorded activity", () => {
    expect(childrenDataIssues(pupils)).toEqual([]);
  });

  it("asks for the age check, the parent's consent and the safeguards", () => {
    const bare = { ...pupils, childAgeCheck: " ", parentalConsent: "", childSafeguards: "" };
    expect(childrenDataIssues(bare)).toEqual(["no_age_check", "no_parental_consent", "no_safeguards"]);
  });

  it("doesn't ask for a parent's consent for counselling or child protection services only (s.33(4))", () => {
    const counselling = { ...pupils, childCounselling: true, parentalConsent: "" };
    expect(needsParentalConsent(counselling)).toBe(false);
    expect(childrenDataIssues(counselling)).toEqual([]);
  });

  it("leaves the consent to the controller when the activity is a processor's, but still asks the rest", () => {
    const processor = { ...pupils, role: "processor", parentalConsent: "", childSafeguards: "" };
    expect(needsParentalConsent(processor)).toBe(false);
    expect(childrenDataIssues(processor)).toEqual(["no_safeguards"]);
  });

  it("asks a controller nobody has confirmed for the consent", () => {
    expect(childrenDataIssues({ ...pupils, role: null, parentalConsent: "" })).toEqual(["no_parental_consent"]);
  });

  it("lists only the activities with something missing", () => {
    const missing = { ...pupils, name: "Photographs", childSafeguards: "" };
    expect(activitiesWithChildrenDataIssues([adults, pupils, missing])).toEqual([{ activity: missing, issues: ["no_safeguards"] }]);
  });
});

describe("wording", () => {
  it("gives a gap for every issue", () => {
    expect(Object.keys(CHILDREN_DATA_GAP)).toEqual(["no_age_check", "no_parental_consent", "no_safeguards"]);
  });

  it("puts the issues in one dashboard step and one report finding", () => {
    expect(childrenDataTodo(pupils, ["no_safeguards"])).toBe("Say how children are protected for the children's data in Pupil records");
    expect(childrenDataTodo(pupils, ["no_age_check", "no_parental_consent", "no_safeguards"])).toBe(
      "Say how you check age, how a parent consents and how children are protected for the children's data in Pupil records",
    );
    expect(childrenDataFinding(pupils, ["no_age_check", "no_safeguards"])).toBe(
      "Pupil records involves children's data, and the record doesn't say how a child's data is told apart (s.33(2)) and how the processing protects the child (s.33(1)(b)).",
    );
  });

  it("describes how a parent consents, or why nobody needs to say", () => {
    expect(describeParentalConsent(adults)).toBe("");
    expect(describeParentalConsent(pupils)).toBe(pupils.parentalConsent);
    expect(describeParentalConsent({ ...pupils, parentalConsent: "" })).toBe("Not recorded");
    expect(describeParentalConsent({ ...pupils, parentalConsent: "", childCounselling: true })).toBe(
      "Not needed: counselling or child protection services only (s.33(4))",
    );
    expect(describeParentalConsent({ ...pupils, parentalConsent: "", role: "processor" })).toBe("For the controller to get");
  });
});

describe("the RoPA", () => {
  const template = ACTIVITY_TEMPLATES.find((t) => t.id === "student-records")!;

  it("reads the details from the form, and clears them when the box is unticked", () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      name: "Pupils",
      purpose: "Teach",
      lawfulBasis: "legal_obligation",
      role: "controller",
      dataSubjects: "Students",
      dataCategories: "Name",
      retentionPeriod: "7 years",
    }))
      form.set(k, v);
    form.set("childAgeCheck", "Birth certificate");
    form.set("childCounselling", "on");
    form.set("parentalConsent", "Admission form");
    form.set("childSafeguards", "Locked file");
    const unticked = parseActivityForm(form);
    expect(unticked.success).toBe(true);
    expect(activityToSave(unticked.data as ActivityInput)).toMatchObject({
      involvesChildren: false,
      childAgeCheck: "",
      childCounselling: false,
      parentalConsent: "",
      childSafeguards: "",
    });
    form.set("involvesChildren", "on");
    form.delete("childCounselling");
    const ticked = parseActivityForm(form);
    expect(activityToSave(ticked.data as ActivityInput)).toMatchObject({
      involvesChildren: true,
      childAgeCheck: "Birth certificate",
      childCounselling: false,
      parentalConsent: "Admission form",
      childSafeguards: "Locked file",
    });
  });

  it("drops how a parent consents when the activity is counselling or child protection only, as the form hides it (s.33(4))", () => {
    expect(activityToSave({ ...template, childCounselling: true })).toMatchObject({
      childCounselling: true,
      parentalConsent: "",
      childAgeCheck: template.childAgeCheck,
      childSafeguards: template.childSafeguards,
    });
  });

  it("exports the details as columns", () => {
    const cells = (a: ActivityInput) => Object.fromEntries(ROPA_COLUMNS.map((c) => [c.header, c.value(a)]));
    expect(cells(template)).toMatchObject({
      "Children's data": "Yes",
      "How a child's data is told apart (s.33(2))": template.childAgeCheck,
      "How a parent or guardian consents (s.33(1)(a))": template.parentalConsent,
      "How children are protected (s.33(1)(b))": template.childSafeguards,
    });
    const none = ACTIVITY_TEMPLATES.find((t) => !t.involvesChildren)!;
    expect(cells(none)).toMatchObject({
      "Children's data": "No",
      "How a child's data is told apart (s.33(2))": "",
      "How a parent or guardian consents (s.33(1)(a))": "",
      "How children are protected (s.33(1)(b))": "",
    });
  });

  it("fills in every template that involves children, and nothing in the rest", () => {
    for (const t of ACTIVITY_TEMPLATES) {
      if (t.involvesChildren) expect(childrenDataIssues(t), t.id).toEqual([]);
      else expect(t, t.id).toMatchObject({ childAgeCheck: "", childCounselling: false, parentalConsent: "", childSafeguards: "" });
    }
    expect(ACTIVITY_TEMPLATES.filter((t) => t.involvesChildren).length).toBeGreaterThan(0);
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
    const [org] = await db.insert(organizations).values({ name: "Shule Bora", sector: "education", size: "micro_small" }).returning();
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId: org.id, name: "Pupil records", purpose: "Teach pupils", lawfulBasis: "legal_obligation", retentionPeriod: "7 years" })
      .returning();
    activityId = activity.id;
  });

  const update = (set: Partial<typeof processingActivities.$inferInsert>) =>
    db.update(processingActivities).set(set).where(eq(processingActivities.id, activityId));

  it("starts an activity without children's data", async () => {
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row).toMatchObject({ involvesChildren: false, childAgeCheck: "", childCounselling: false, parentalConsent: "", childSafeguards: "" });
  });

  it("keeps the details only on an activity that involves children", async () => {
    await expect(update({ childAgeCheck: "Birth certificate" })).rejects.toThrow();
    await expect(update({ childCounselling: true })).rejects.toThrow();
    await expect(update({ parentalConsent: "Admission form" })).rejects.toThrow();
    await expect(update({ childSafeguards: "Locked file" })).rejects.toThrow();
    await update({ involvesChildren: true, childAgeCheck: "Birth certificate", parentalConsent: "Admission form", childSafeguards: "Locked file" });
    await expect(update({ involvesChildren: false })).rejects.toThrow();
  });

  it("names the changes in the activity's history, without counting them as registered particulars", () => {
    const before = { involvesChildren: false, childAgeCheck: "", childCounselling: false, parentalConsent: "", childSafeguards: "" };
    const after = { involvesChildren: true, childAgeCheck: "Birth certificate", childCounselling: true, parentalConsent: "Form", childSafeguards: "Locked" };
    expect(changedFields(before, after, FIELD_LABELS.ropa)).toEqual([
      "children's data",
      "how a child's data is told apart",
      "counselling or child protection services only",
      "how a parent or guardian consents",
      "how children are protected",
    ]);
    for (const key of Object.keys(before)) expect(ROPA_PARTICULARS).not.toHaveProperty(key);
  });
});
