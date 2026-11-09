import { describe, expect, it } from "vitest";
import { SECTOR_KEYS } from "@/lib/dpa";
import {
  ACTIVITY_TEMPLATES,
  activityFormSchema,
  activityToSave,
  dpiaRecommended,
  dpiaTriggers,
  parseActivityForm,
  ropaToCsv,
  templatesForSector,
} from "@/lib/ropa";

function form(entries: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

const valid = {
  name: "Payroll",
  purpose: "Pay staff salaries",
  lawfulBasis: "contract",
  role: "controller",
  dataSubjects: "Employees, Next of kin",
  dataCategories: "Name\nKRA PIN\n\nBank details",
  retentionPeriod: "7 years",
};

describe("parseActivityForm", () => {
  it("splits list fields on commas and newlines", () => {
    const r = parseActivityForm(form(valid));
    expect(r.success).toBe(true);
    expect(r.data!.dataSubjects).toEqual(["Employees", "Next of kin"]);
    expect(r.data!.dataCategories).toEqual(["Name", "KRA PIN", "Bank details"]);
    expect(r.data!.crossBorder).toBe(false);
  });

  it("reads checkboxes and multi-selects", () => {
    const r = parseActivityForm(
      form({
        ...valid,
        crossBorder: "on",
        transferCountries: "South Africa",
        sensitiveCategories: ["Health status", "Biometric data"],
      }),
    );
    expect(r.data!.crossBorder).toBe(true);
    expect(r.data!.sensitiveCategories).toEqual(["Health status", "Biometric data"]);
  });

  it("requires destination countries for cross-border transfers", () => {
    const r = parseActivityForm(form({ ...valid, crossBorder: "on" }));
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join("."))).toContain("transferCountries");
  });

  it("rejects sensitive categories outside the statutory list", () => {
    const r = parseActivityForm(form({ ...valid, sensitiveCategories: ["Health status", "Shoe size"] }));
    expect(r.success).toBe(false);
  });

  it("reads the automated decision details, and leaves the ground empty when none is chosen", () => {
    const r = parseActivityForm(
      form({
        ...valid,
        automatedDecisions: "on",
        automatedDecisionGround: "contract",
        automatedDecisionLogic: " A model scores the application ",
        automatedDecisionReview: "Reply to the decision email",
        automatedDecisionChecks: "Monthly review of declines",
      }),
    );
    expect(r.data).toMatchObject({
      automatedDecisions: true,
      automatedDecisionGround: "contract",
      automatedDecisionLogic: "A model scores the application",
      automatedDecisionReview: "Reply to the decision email",
      automatedDecisionChecks: "Monthly review of declines",
    });
    const plain = parseActivityForm(form(valid));
    expect(plain.data).toMatchObject({ automatedDecisions: false, automatedDecisionGround: null, automatedDecisionLogic: "" });
  });

  it("only accepts a listed ground for automated decisions", () => {
    const r = parseActivityForm(form({ ...valid, automatedDecisions: "on", automatedDecisionGround: "convenience" }));
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join("."))).toContain("automatedDecisionGround");
  });

  it("reports the transfer error alongside other field errors", () => {
    const r = parseActivityForm(form({ ...valid, retentionPeriod: "", crossBorder: "on" }));
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining(["retentionPeriod", "transferCountries"]),
    );
  });

  it("reads the retention period as a length, and leaves it out when blank", () => {
    const r = parseActivityForm(form({ ...valid, retentionLength: " 7 ", retentionUnit: "years", retentionFrom: "the end of employment" }));
    expect(r.data).toMatchObject({ retentionLength: 7, retentionUnit: "years", retentionFrom: "the end of employment" });
    const blank = parseActivityForm(form({ ...valid, retentionLength: "", retentionUnit: "" }));
    expect(blank.data).toMatchObject({ retentionLength: null, retentionUnit: null, retentionFrom: "" });
  });

  it("needs the length and the unit together", () => {
    const paths = (entries: Record<string, string>) =>
      parseActivityForm(form({ ...valid, ...entries })).error?.issues.map((i) => i.path.join("."));
    expect(paths({ retentionLength: "7" })).toEqual(["retentionUnit"]);
    expect(paths({ retentionUnit: "years" })).toEqual(["retentionLength"]);
    expect(paths({ retentionFrom: "the end of employment" })).toEqual(["retentionLength"]);
  });

  it("takes a whole number above zero, up to a hundred years", () => {
    const ok = (retentionLength: string, retentionUnit: string) =>
      parseActivityForm(form({ ...valid, retentionLength, retentionUnit })).success;
    expect(ok("0", "days")).toBe(false);
    expect(ok("2.5", "years")).toBe(false);
    expect(ok("-1", "months")).toBe(false);
    expect(ok("100", "years")).toBe(true);
    expect(ok("101", "years")).toBe(false);
    expect(ok("1200", "months")).toBe(true);
    expect(ok("1201", "months")).toBe(false);
    expect(ok("36525", "days")).toBe(true);
    expect(ok("36526", "days")).toBe(false);
    expect(ok("7", "decades")).toBe(false);
  });

  it("rejects unknown lawful bases and empty subject lists", () => {
    const r = parseActivityForm(form({ ...valid, lawfulBasis: "because", dataSubjects: " , " }));
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["lawfulBasis", "dataSubjects"]));
  });
});

describe("DPIA screening", () => {
  const plain = {
    sensitiveCategories: [],
    crossBorder: false,
    largeScale: false,
    systematicMonitoring: false,
    involvesChildren: false,
    automatedDecisions: false,
  };

  it("does not flag ordinary processing", () => {
    expect(dpiaTriggers(plain)).toEqual([]);
    expect(dpiaRecommended(plain)).toBe(false);
  });

  it("flags systematic monitoring on its own", () => {
    expect(dpiaRecommended({ ...plain, systematicMonitoring: true })).toBe(true);
  });

  it("needs two triggers otherwise", () => {
    expect(dpiaRecommended({ ...plain, crossBorder: true })).toBe(false);
    expect(dpiaRecommended({ ...plain, crossBorder: true, involvesChildren: true })).toBe(true);
  });

  it("flags automated decisions on their own (reg. 49(1)(a))", () => {
    const automated = { ...plain, automatedDecisions: true };
    expect(dpiaRecommended(automated)).toBe(true);
    expect(dpiaTriggers(automated)[0]).toContain("reg. 49(1)(a)");
  });
});

describe("activityToSave", () => {
  const parsed = () =>
    parseActivityForm(
      form({
        ...valid,
        crossBorder: "on",
        transferCountries: "Ireland",
        transferSafeguards: "Contract clauses",
        automatedDecisions: "on",
        automatedDecisionGround: "consent",
        automatedDecisionLogic: "Scores applicants",
        automatedDecisionReview: "Email us",
        automatedDecisionChecks: "Quarterly audit",
      }),
    ).data!;

  it("keeps the details of what is ticked", () => {
    expect(activityToSave(parsed())).toEqual(parsed());
  });

  it("drops the transfer and automated decision details when their boxes aren't ticked", () => {
    const saved = activityToSave({ ...parsed(), crossBorder: false, automatedDecisions: false });
    expect(saved).toMatchObject({
      transferCountries: "",
      transferSafeguards: "",
      automatedDecisionGround: null,
      automatedDecisionLogic: "",
      automatedDecisionReview: "",
      automatedDecisionChecks: "",
    });
  });
});

describe("ropaToCsv", () => {
  it("quotes cells, escapes quotes and neutralises formulas", () => {
    const [tpl] = ACTIVITY_TEMPLATES;
    const csv = ropaToCsv([{ ...tpl, name: '=HYPERLINK("x")', purpose: 'He said "hi"' }]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain(`"He said ""hi"""`);
  });

  it("says whether an activity takes automated decisions, and on what ground", () => {
    const [tpl] = ACTIVITY_TEMPLATES;
    const header = ropaToCsv([]).trim().slice(1).split(",");
    const row = (a: typeof tpl) => ropaToCsv([a]).trim().split("\r\n")[1];
    const col = header.indexOf('"Automated decisions"');
    expect(col).toBeGreaterThan(-1);
    expect(row(tpl)).toContain('"No"');
    expect(row({ ...tpl, automatedDecisions: true })).toContain('"Yes: ground not recorded"');
    expect(row({ ...tpl, automatedDecisions: true, automatedDecisionGround: "contract", automatedDecisionLogic: "Scores loans" })).toContain(
      '"Yes: Necessary to enter into or carry out a contract with the person","Scores loans"',
    );
  });
});

describe("templates", () => {
  it("are all valid against the form schema", () => {
    for (const t of ACTIVITY_TEMPLATES) {
      const r = activityFormSchema.safeParse({
        ...t,
        dataSubjects: t.dataSubjects.join(","),
        dataCategories: t.dataCategories.join(","),
        crossBorder: String(t.crossBorder),
        largeScale: String(t.largeScale),
        systematicMonitoring: String(t.systematicMonitoring),
        involvesChildren: String(t.involvesChildren),
        automatedDecisions: String(t.automatedDecisions),
        automatedDecisionGround: t.automatedDecisionGround ?? "",
        retentionLength: t.retentionLength?.toString() ?? "",
        retentionUnit: t.retentionUnit ?? "",
      });
      expect(r.success, `${t.id}: ${r.error?.message}`).toBe(true);
    }
  });

  it("say whether the data is required, unless they rely on consent", () => {
    const unanswered = ACTIVITY_TEMPLATES.filter((t) => t.lawfulBasis !== "consent" && !t.provision);
    expect(unanswered.map((t) => t.id)).toEqual([]);
  });

  it("have unique ids and cover every sector", () => {
    expect(new Set(ACTIVITY_TEMPLATES.map((t) => t.id)).size).toBe(ACTIVITY_TEMPLATES.length);
    for (const s of SECTOR_KEYS) expect(templatesForSector(s).length).toBeGreaterThan(0);
  });
});
