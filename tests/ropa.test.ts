import { describe, expect, it } from "vitest";
import { SECTOR_KEYS } from "@/lib/dpa";
import {
  ACTIVITY_TEMPLATES,
  activityFormSchema,
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

  it("reports the transfer error alongside other field errors", () => {
    const r = parseActivityForm(form({ ...valid, retentionPeriod: "", crossBorder: "on" }));
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining(["retentionPeriod", "transferCountries"]),
    );
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
      });
      expect(r.success, `${t.id}: ${r.error?.message}`).toBe(true);
    }
  });

  it("have unique ids and cover every sector", () => {
    expect(new Set(ACTIVITY_TEMPLATES.map((t) => t.id)).size).toBe(ACTIVITY_TEMPLATES.length);
    for (const s of SECTOR_KEYS) expect(templatesForSector(s).length).toBeGreaterThan(0);
  });
});
