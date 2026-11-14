import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, FIELD_LABELS } from "@/lib/activity";
import {
  activitiesWithAutomatedDecisionIssues,
  AUTOMATED_DECISION_GAP,
  AUTOMATED_DECISION_GROUND_DETAIL,
  AUTOMATED_DECISION_GROUND_KEYS,
  type AutomatedDecisionLike,
  automatedDecisionFinding,
  automatedDecisionIssues,
  automatedDecisionNotice,
  automatedDecisionTodo,
} from "@/lib/automated-decision";
import { openTestDb } from "./helpers/db";

const { organizations, processingActivities } = schema;

const scoring: AutomatedDecisionLike = {
  name: "Loan applications",
  automatedDecisions: true,
  automatedDecisionGround: "contract",
  automatedDecisionLogic: "A scoring model approves or declines the loan from your M-Pesa history",
  automatedDecisionReview: "Reply to the decision SMS and a loans officer will review it within 7 days.",
  automatedDecisionChecks: "Monthly review of declines by age and gender",
};
const unrecorded: AutomatedDecisionLike = {
  ...scoring,
  automatedDecisionGround: null,
  automatedDecisionLogic: "",
  automatedDecisionReview: " ",
  automatedDecisionChecks: "",
};

describe("automatedDecisionIssues", () => {
  it("has none for an activity without automated decisions, whatever its fields say", () => {
    expect(automatedDecisionIssues({ ...unrecorded, automatedDecisions: false })).toEqual([]);
  });

  it("has none when everything is recorded", () => {
    expect(automatedDecisionIssues(scoring)).toEqual([]);
  });

  it("lists each missing detail, treating blank text as missing", () => {
    expect(automatedDecisionIssues(unrecorded)).toEqual(["no_ground", "no_logic", "no_review", "no_checks"]);
    expect(automatedDecisionIssues({ ...scoring, automatedDecisionChecks: "  " })).toEqual(["no_checks"]);
  });

  it("explains every issue and every ground", () => {
    for (const issue of automatedDecisionIssues(unrecorded)) expect(AUTOMATED_DECISION_GAP[issue]).toBeTruthy();
    for (const ground of AUTOMATED_DECISION_GROUND_KEYS) expect(AUTOMATED_DECISION_GROUND_DETAIL[ground]).toBeTruthy();
  });
});

describe("what the gaps read as", () => {
  it("joins the missing details into one next step and one finding", () => {
    expect(automatedDecisionTodo(scoring, ["no_ground"])).toBe("Say what allows them for the automated decisions in Loan applications");
    expect(automatedDecisionTodo(scoring, ["no_logic", "no_review", "no_checks"])).toBe(
      "Say how they're made, how people ask for a person to look again and how errors and bias are checked for the automated decisions in Loan applications",
    );
    expect(automatedDecisionFinding(scoring, ["no_ground", "no_checks"])).toBe(
      "Loan applications takes decisions by automated means alone, and the record doesn't say what s.35(2) ground allows them and how errors and bias are checked for.",
    );
  });

  it("only picks out the activities with something missing", () => {
    const fine = { ...scoring, name: "Fine" };
    const none = { ...unrecorded, name: "None", automatedDecisions: false };
    const gaps = activitiesWithAutomatedDecisionIssues([fine, none, unrecorded]);
    expect(gaps.map((g) => g.activity)).toEqual([unrecorded]);
    expect(gaps[0].issues).toHaveLength(4);
  });
});

describe("automatedDecisionNotice", () => {
  it("says nothing for an activity without automated decisions", () => {
    expect(automatedDecisionNotice({ ...scoring, automatedDecisions: false })).toBeNull();
  });

  it("gives the logic, the right to a person and how to ask, as sentences", () => {
    expect(automatedDecisionNotice(scoring)).toBe(
      "A scoring model approves or declines the loan from your M-Pesa history. We'll tell you in writing when a decision has been made this way, and you can ask us to reconsider it or to have a person take it again. Reply to the decision SMS and a loans officer will review it within 7 days.",
    );
  });

  it("still tells people about the decisions and the right when the record has no details", () => {
    expect(automatedDecisionNotice(unrecorded)).toBe(
      "Some decisions about you are made by automated means, without a person involved. We'll tell you in writing when a decision has been made this way, and you can ask us to reconsider it or to have a person take it again.",
    );
  });
});

describe("in the database", () => {
  let db: Db;
  let activityId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const [org] = await db.insert(organizations).values({ name: "Haraka Credit", sector: "fintech", size: "micro_small" }).returning();
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId: org.id, name: "Loan applications", purpose: "Lend money", lawfulBasis: "contract", retentionPeriod: "7 years" })
      .returning();
    activityId = activity.id;
  });

  const update = (set: Partial<typeof processingActivities.$inferInsert>) =>
    db.update(processingActivities).set(set).where(eq(processingActivities.id, activityId));

  it("starts an activity with no automated decisions", async () => {
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row).toMatchObject({ automatedDecisions: false, automatedDecisionGround: null, automatedDecisionLogic: "" });
  });

  it("keeps the details only on an activity that takes automated decisions", async () => {
    await expect(update({ automatedDecisionGround: "contract" })).rejects.toThrow();
    await expect(update({ automatedDecisionLogic: "Scores" })).rejects.toThrow();
    await expect(update({ automatedDecisionReview: "Email us" })).rejects.toThrow();
    await expect(update({ automatedDecisionChecks: "Audit" })).rejects.toThrow();
    await update({ automatedDecisions: true, automatedDecisionGround: "consent", automatedDecisionLogic: "Scores" });
    await expect(update({ automatedDecisions: false })).rejects.toThrow();
  });

  it("only stores a ground it knows", async () => {
    await expect(update({ automatedDecisions: true, automatedDecisionGround: "convenience" as "contract" })).rejects.toThrow();
  });

  it("names the changes in the activity's history", () => {
    const before = { automatedDecisions: false, automatedDecisionGround: null, automatedDecisionChecks: "" };
    expect(changedFields(before, { automatedDecisions: true, automatedDecisionGround: "law", automatedDecisionChecks: "Audit" }, FIELD_LABELS.ropa)).toEqual([
      "automated decisions",
      "what allows the automated decisions",
      "checks for errors and bias",
    ]);
  });
});
