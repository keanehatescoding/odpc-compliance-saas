import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { changedFields, FIELD_LABELS } from "@/lib/activity";
import {
  activitiesWithDirectMarketingIssues,
  type DirectMarketingLike,
  directMarketingFinding,
  directMarketingGap,
  directMarketingIssues,
  directMarketingNotice,
  directMarketingTodo,
  MARKETING_GROUND_DETAIL,
  MARKETING_GROUND_KEYS,
  MARKETING_GROUNDS,
} from "@/lib/direct-marketing";
import { ROPA_PARTICULARS } from "@/lib/particulars";

const { organizations, processingActivities } = schema;

const offers: DirectMarketingLike = {
  name: "Customer offers",
  directMarketing: true,
  marketingGround: "consent",
  marketingChannels: "Weekly offers by SMS",
  marketingOptOut: "Reply STOP, free of charge.",
  marketingOptOutRecords: "The unsubscribe list in the CRM, removed from every send",
  sensitiveCategories: [],
};
const unrecorded: DirectMarketingLike = {
  ...offers,
  marketingGround: null,
  marketingChannels: "",
  marketingOptOut: " ",
  marketingOptOutRecords: "",
};

describe("directMarketingIssues", () => {
  it("has none for an activity not used for marketing, whatever its fields say", () => {
    expect(directMarketingIssues({ ...unrecorded, directMarketing: false, sensitiveCategories: ["Health data"] })).toEqual([]);
  });

  it("has none when everything is recorded", () => {
    expect(directMarketingIssues(offers)).toEqual([]);
  });

  it("lists each missing detail, treating blank text as missing", () => {
    expect(directMarketingIssues(unrecorded)).toEqual(["no_ground", "no_channels", "no_opt_out", "no_opt_out_records"]);
    expect(directMarketingIssues({ ...offers, marketingOptOutRecords: "  " })).toEqual(["no_opt_out_records"]);
  });

  it("flags sensitive personal data, which reg. 15(1) keeps out of marketing", () => {
    expect(directMarketingIssues({ ...offers, sensitiveCategories: ["Health data"] })).toEqual(["sensitive"]);
  });

  it("explains every issue and every ground", () => {
    const withSensitive = { ...unrecorded, sensitiveCategories: ["Health data", "Biometric data"] };
    for (const issue of directMarketingIssues(withSensitive)) expect(directMarketingGap(withSensitive, issue)).toBeTruthy();
    expect(directMarketingGap(withSensitive, "sensitive")).toContain("involves health data, biometric data.");
    for (const ground of MARKETING_GROUND_KEYS) {
      expect(MARKETING_GROUNDS[ground]).toBeTruthy();
      expect(MARKETING_GROUND_DETAIL[ground]).toBeTruthy();
    }
  });
});

describe("what the gaps read as", () => {
  it("joins the missing details into one next step", () => {
    expect(directMarketingTodo(offers, ["no_ground"])).toBe("Say what allows it for the marketing in Customer offers");
    expect(directMarketingTodo(offers, ["no_opt_out", "no_opt_out_records"])).toBe(
      "Say how people opt out and where opt-outs are kept for the marketing in Customer offers",
    );
    expect(directMarketingTodo(offers, ["sensitive"])).toBe("Keep sensitive data out of it for the marketing in Customer offers");
    expect(directMarketingTodo(offers, ["no_channels", "sensitive"])).toBe(
      "Say how you market and keep sensitive data out of it for the marketing in Customer offers",
    );
  });

  it("states them as a finding for the report", () => {
    expect(directMarketingFinding(offers, ["no_ground", "no_opt_out_records"])).toBe(
      "Customer offers is used for direct marketing, and the record doesn't say what s.37(1) ground allows it and where opt-outs are kept or how they're honoured.",
    );
    expect(directMarketingFinding(offers, ["sensitive"])).toBe(
      "Customer offers is used for direct marketing and involves sensitive personal data, which reg. 15(1) doesn't allow to be used for it.",
    );
    expect(directMarketingFinding(offers, ["no_channels", "sensitive"])).toBe(
      "Customer offers is used for direct marketing, and the record doesn't say how people are marketed to. Customer offers is used for direct marketing and involves sensitive personal data, which reg. 15(1) doesn't allow to be used for it.",
    );
  });

  it("only picks out the marketing activities with something missing", () => {
    const fine = { ...offers, name: "Fine" };
    const none = { ...unrecorded, name: "None", directMarketing: false };
    const gaps = activitiesWithDirectMarketingIssues([fine, none, unrecorded]);
    expect(gaps.map((g) => g.activity)).toEqual([unrecorded]);
    expect(gaps[0].issues).toHaveLength(4);
  });
});

describe("directMarketingNotice", () => {
  it("says nothing for an activity not used for marketing", () => {
    expect(directMarketingNotice({ ...offers, directMarketing: false })).toBeNull();
  });

  it("gives the channels, the right to opt out and how, as sentences", () => {
    expect(directMarketingNotice(offers)).toBe(
      "We use your details to send you marketing. Weekly offers by SMS. You can opt out at any time, free of charge, and we'll stop. Reply STOP, free of charge.",
    );
  });

  it("still tells people about the marketing and the right when the record has no details", () => {
    expect(directMarketingNotice(unrecorded)).toBe("We use your details to send you marketing. You can opt out at any time, free of charge, and we'll stop.");
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
    const [org] = await db.insert(organizations).values({ name: "Duka Bora", sector: "retail", size: "micro_small" }).returning();
    const [activity] = await db
      .insert(processingActivities)
      .values({ orgId: org.id, name: "Customer offers", purpose: "Tell customers about offers", lawfulBasis: "consent", retentionPeriod: "Until they opt out" })
      .returning();
    activityId = activity.id;
  });

  const update = (set: Partial<typeof processingActivities.$inferInsert>) =>
    db.update(processingActivities).set(set).where(eq(processingActivities.id, activityId));

  it("starts an activity with no marketing", async () => {
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, activityId));
    expect(row).toMatchObject({ directMarketing: false, marketingGround: null, marketingChannels: "", marketingOptOut: "", marketingOptOutRecords: "" });
  });

  it("keeps the details only on an activity used for marketing", async () => {
    await expect(update({ marketingGround: "consent" })).rejects.toThrow();
    await expect(update({ marketingChannels: "SMS" })).rejects.toThrow();
    await expect(update({ marketingOptOut: "Reply STOP" })).rejects.toThrow();
    await expect(update({ marketingOptOutRecords: "CRM" })).rejects.toThrow();
    await update({ directMarketing: true, marketingGround: "consent", marketingOptOut: "Reply STOP" });
    await expect(update({ directMarketing: false })).rejects.toThrow();
  });

  it("only stores a ground it knows", async () => {
    await expect(update({ directMarketing: true, marketingGround: "legitimate_interests" as "consent" })).rejects.toThrow();
  });

  it("names the changes in the activity's history, and counts starting marketing as a registered particular", () => {
    const before = { directMarketing: false, marketingGround: null, marketingOptOut: "" };
    expect(changedFields(before, { directMarketing: true, marketingGround: "consent", marketingOptOut: "Reply STOP" }, FIELD_LABELS.ropa)).toEqual([
      "direct marketing",
      "what allows the marketing",
      "how people opt out of marketing",
    ]);
    expect(ROPA_PARTICULARS).toHaveProperty("directMarketing");
  });
});
